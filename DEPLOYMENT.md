# DEPLOYMENT: production plan

Target load: 100,000 registered users, ~10,000 daily active. Peak (results day): ~500 batches
approved in one hour = ~30,000 PDFs and ~30,000 WhatsApp messages. Public verification: thousands of
lookups a day, in bursts.

## 1. Architecture

```
                    ┌──────────────────────────── CDN / WAF (rate limits, TLS) ──────────────────────────┐
 Browser (React) ───┤  static web (S3 + CloudFront)        /api/* ──► Load balancer ──► API (Express) x N   │
 Employer (verify) ─┘                                                       │  ▲                           │
                                                                            │  │ cache (verify), pub/sub   │
                                       write state + outbox row (1 tx)      ▼  │                           │
                                   ┌──────────────► PostgreSQL (primary) ◄── Redis (ElastiCache) ◄─────────┘
                                   │                    │  read replica            ▲  BullMQ queues
                                   │                    ▼  (verify, lists)         │
                          Outbox relay (in worker) ── publishes ──► BullMQ: certiflow-events ──► Worker x M
                                                                    BullMQ: certiflow-delivery ─► Worker x M ──► WhatsApp provider
                                                                                                    │
                                                                                                    ▼
                                                                                  Object storage (S3): certificate PDFs
```

Event flow for one approval: the state officer's request updates the batch and inserts an
`OutboxEvent` in **one transaction** → the relay publishes it to `certiflow-events` (job id = event
id) → a worker issues certificates (idempotent `INSERT ... ON CONFLICT DO NOTHING`, numbers from a
Postgres sequence) → one `deliver` job per certificate on `certiflow-delivery` (job id =
`deliver-<certificateId>`) → PDF to S3 → WhatsApp with idempotency key = certificate id.

## 2. Where each component runs, and why

| Component | Hosting | Why |
|---|---|---|
| Web (static React build) | S3 + CloudFront | Static files, cheap, cached at the edge |
| API (Express) | ECS Fargate service, 2-6 tasks behind an ALB | Stateless containers (session is a signed cookie), autoscale on CPU and request count |
| Worker | ECS Fargate service, 2-20 tasks | Same image as the API, scales on queue depth |
| PostgreSQL | RDS PostgreSQL 16, Multi-AZ, + 1 read replica | Transactions and unique constraints are the core guarantees; managed backups and failover |
| Redis | ElastiCache Redis 7 with replica, AOF on | BullMQ queues + verify cache + pub/sub; persistence so queued jobs survive a restart |
| PDFs | S3 bucket (private), Object Lock optional | Durable, cheap, signed URLs for downloads |
| WhatsApp | WhatsApp Business API provider (e.g. Gupshup / Meta Cloud API) | Real provider replaces the stand-in |
| Secrets | AWS Secrets Manager | `SESSION_SECRET`, `CERT_HMAC_SECRET`, DB and provider credentials, rotated |

A region in India (ap-south-1, Mumbai) keeps personal data in-country and latency low.

## 3. Scaling

**Horizontal:** API tasks (stateless), worker tasks (any number, every job idempotent; BullMQ hands
each job to one worker and recovers stalled jobs from a crashed one), outbox relays (`FOR UPDATE SKIP
LOCKED`, so several can run).

**Peak maths (30,000 certificates in an hour ≈ 8.3 per second):**
- PDF generation is CPU-light (text PDF, ~5 ms). 4 workers × 10 concurrent jobs is far above 8/s.
- The real limit is the **WhatsApp provider's rate limit** (typically 20-80 msg/s per number tier).
  BullMQ's `limiter` caps sends per second so we never get throttled into errors; the backlog
  simply drains: at 20 msg/s, 30,000 messages take 25 minutes.
- Database: ~4 writes per certificate (certificate, delivery, audit, update) ≈ 35 writes/s at peak,
  trivial for RDS. Connection pooling: Prisma pool per task + RDS Proxy (or PgBouncer) to cap total
  connections when tasks autoscale.
- Verification bursts: served from Redis (60 s TTL, deleted on cancel), then the read replica. Per-IP
  rate limit at the WAF and in the API (move the in-memory limiter to a Redis store when there is more
  than one API task).

**Backlog clearing:** autoscale workers on `waiting` jobs in `certiflow-delivery` (CloudWatch metric
from a small exporter); the provider limiter, not the worker count, sets the drain speed. Batches
stay `COMPLETED` (certificates issued) while delivery continues, and the UI shows per-certificate
delivery state.

**Indexes:** `Batch(status, stepEnteredAt)` for queues and escalation, `Batch(centreId)`,
`Certificate(number)` unique, `Certificate(batchId)`, `Approval(batchId)`,
`AuditLog(entityType, entityId)`, `OutboxEvent(publishedAt)`.

## 4. Failure handling

| Failure | What happens | Why nothing is lost or duplicated |
|---|---|---|
| Worker crashes mid-batch | BullMQ marks the job stalled and another worker re-runs it | Issuing only creates certificates for candidates without one; unique constraints on `candidateId` and `(phone, courseCode)` |
| API crashes after commit, before publishing | Event is still in `OutboxEvent` with `publishedAt = null`; the relay publishes it | Transactional outbox; job id = event id de-duplicates a double publish |
| Redis restart | With AOF persistence, queues come back; if data is lost, unpublished events are still in the outbox and a re-run of issuing is safe. Verify falls back to the database (cache client fails fast). | Postgres is the source of truth; every job is idempotent |
| WhatsApp outage | Delivery jobs fail and retry with exponential backoff (8 attempts); after that the delivery is `FAILED` and listed for the state office with a Resend button. Users are never blocked. | Idempotency key = certificate id, so a retry after a timeout never sends twice |
| Slow database | API requests time out at the load balancer (shed load), workers slow down but keep their jobs; statement timeout per query; alarms on p95 latency and replica lag | Locks are held only for one batch row per review, briefly |

## 5. Certificate files and access control

- PDFs are written by workers to a **private** S3 bucket, key `certificates/<year>/<certificateId>.pdf`.
- Candidates get a **signed, expiring link** (HMAC today; S3 pre-signed URL in production) on
  WhatsApp. Ids are UUIDs and links expire, so guessing does not work.
- Cancelled certificates: the download endpoint refuses them, and verification shows CANCELLED.
- The public verify page returns masked data only (masked name, course, date, centre). No phone, no
  date of birth.
- Each certificate has an HMAC of number + holder + course to detect tampered records.

## 6. Monitoring and alerts

- Structured JSON logs (pino) with request id, batch id and certificate id → CloudWatch Logs.
- `/api/health` (DB + Redis) for the load balancer.
- Metrics and alerts: queue depth and oldest job age (delivery), failed deliveries per hour,
  outbox rows unpublished for > 1 minute, stuck (escalated) batches, API 5xx rate and p95 latency,
  RDS CPU / connections / replica lag, Redis memory.
- Page on: outbox lag > 5 min, delivery failure rate > 20% for 10 min, API 5xx > 2%.

## 7. Backups, secrets, rollout

- RDS automated backups (7 days) + point-in-time recovery; monthly restore test. S3 versioning.
- Secrets only from Secrets Manager; nothing in images or the repo.
- Rollout: CI builds one image, runs tests against Postgres and Redis service containers,
  `prisma migrate deploy` as a one-off task (backward-compatible migrations only), then a rolling ECS
  deploy. Rollback = redeploy the previous image (migrations are additive).

## 8. Rough monthly cost (AWS, Mumbai)

| Item | Size | ~USD / month |
|---|---|---|
| ECS Fargate: API 2 × (0.5 vCPU, 1 GB) + worker 2 × (1 vCPU, 2 GB), autoscaling on peak days | | 120 |
| RDS PostgreSQL db.t4g.medium Multi-AZ + 1 replica, 100 GB | | 230 |
| ElastiCache Redis cache.t4g.small + replica | | 60 |
| ALB, CloudFront, S3 (~100k PDFs/month, ~20 GB) | | 50 |
| CloudWatch logs and metrics | | 40 |
| **Infrastructure total** | | **~500** |
| WhatsApp messages (utility template, ~100k/month in India) | | ~100-150 (provider pricing) |

**Trade-offs:** Fargate over Kubernetes (less to operate for a small team); BullMQ on Redis over
Kafka/SQS (already needed for caching, gives retries, delays, repeatable jobs and job-id de-duplication
out of the box; Kafka would be over-sized for ~10 msg/s). If Redis durability becomes a concern, SQS
for delivery jobs is the next step; the outbox keeps the design the same.
