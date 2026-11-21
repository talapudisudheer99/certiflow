# CertiFlow

Skilling-certificate issuance and verification for the Pragati Skills Mission (Algohire hackathon,
21 Nov 2026). **"Approve it properly, issue it once, prove it is real."**

## Requirements note (read first)

**What I understood.** Centres upload passed candidates; two district officers must agree; big
batches get a quality check; the state office has the final say. Approval must turn into exactly one
certificate per candidate, delivered on an unreliable WhatsApp, and anyone must be able to check a
certificate without logging in. Batches must not sit unnoticed, and every decision must be traceable.

**Built and tested:** demo sign-in as the six people with server-side role, district and step checks;
CSV upload validated row by row and saved all-or-nothing; the full review workflow (district x2 →
quality if 50+ → state) with safe concurrent approvals; send back / fix / resend; transactional
outbox → BullMQ → certificate issuing (unique numbers, one per candidate) → PDF → WhatsApp stand-in
with retries and an idempotency key; public verification with Redis cache and rate limit; cancel
that is visible immediately; automatic escalation of stuck batches; append-only audit log; screens for
every role. **All six "moments" and the five "never" rules have automated tests.**

**Not built / limits:** no real WhatsApp or object storage; the verify rate limiter is in memory per
API instance; phone numbers are not proven to belong to the candidate. Full list under *Known limits*.

### Decisions where the brief was unclear

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | What is a "big batch"? | **50 or more** candidates also go to quality review (`QUALITY_REVIEW_MIN_SIZE`). | Brief gives no number; configurable. |
| D2 | "More than one officer must agree" | **Two different officers of the batch's district.** The same officer twice counts once. | Nobody approves alone. Enforced by `UNIQUE(batch, step, officer, cycle)`. |
| D3 | One rejects, another approves | Any **reject** ends the batch (final). Any **send back** returns it to the centre. Only approvals count towards the two. | Simple and safe to explain. |
| D4 | Approvals after send back and fix | **All earlier approvals are cleared**: the batch restarts at district review with `cycle + 1`. Old decisions stay in history. | The content changed, so old approvals no longer cover what is approved. |
| D5 | Quality and state | One approval each. | The brief asks for scrutiny and a final say, not more agreement. |
| D6 | "One certificate per candidate" | Unique per **(phone, course)** and per candidate row; numbers `PSM-<year>-<6 digits>` from a Postgres sequence. | "Never two" becomes a database constraint, not a hope. |
| D7 | "Too long" with an officer | Limits per step (env): district 48 h, quality 48 h, state 24 h. After that the batch is **escalated once** and appears in the state office's *Stuck* list. | Testable rule; minutes in the demo. |
| D8 | Who cancels | **State office only**, with a reason. Never deleted: status `CANCELLED`, verification says so at once. | Audit trail survives. |
| D9 | Login | No passwords (brief: "switch between these people"). Server issues a **signed, HttpOnly cookie**; the person is read only from it. | Real login is out of scope; tampering is still impossible. |
| D10 | WhatsApp | A stand-in service that fails (20%), times out after delivering (10%) and remembers idempotency keys. | Correctness must not depend on the provider. |
| D11 | Live updates | SSE via Redis pub/sub. Screens also poll every 15 s in case a message is missed. | One-way updates are enough, and Redis is already there. |
| D12 | Candidate spreadsheet | Columns `full_name, phone, date_of_birth, course_code, score`; CSV or Excel `.xlsx` (the browser turns the first sheet into CSV). 10-digit Indian mobile; age 14-100; score 0-100; course must match the batch; max 5,000 rows. The server checks every row either way. | Catches the real mistakes (wrong phone, wrong course, duplicates) before anything is saved. |
| D13 | Officer changes their mind | While the batch is still at their step, an officer can **withdraw their own approval** with a reason. The approval stays in the history and stops counting. After the step has moved on, the next reviewer sends it back, or the state office cancels a certificate. Nothing is deleted. | Mistakes are fixed without erasing the record. |

## Run it

```bash
cp .env.example .env      # then set SESSION_SECRET and CERT_HMAC_SECRET (openssl rand -hex 24)
docker compose up --build
```
- Web: http://localhost:8080 (pick a person to sign in) · Verify: http://localhost:8080/verify
- API health: http://localhost:4000/api/health · WhatsApp stand-in log: http://localhost:4100/v1/messages

Tests and the non-Docker setup: see **SETUP.md**. Demo CSVs: `docs/demo/`.

## How to use CertiFlow (roles, pages, steps)

### Who is who
| Person | Role | Works for | Main job |
|---|---|---|---|
| **Anika** | Training centre | Private centre | Creates batches, uploads students, sends for approval, fixes and resends |
| **Dev, Meera, Kabir** | District officers | Government (North District) | Approve, send back or reject. **Any 2 of the 3 must approve** |
| **Neha** | Quality team | Government | Extra check for **big batches (50+ students)** |
| **Farah** | State office | Government | **Final approval**, stuck batches, cancel a certificate, resend a failed WhatsApp |
| Students | Candidates | - | Never log in. Get the certificate on WhatsApp with a download link |
| Employers | Public | - | Never log in. Check a certificate number on `/verify` |

- A **batch** = one group of students who finished **one course** (one exact course code, e.g. `ELEC-101`).
- Approval order: **District (2 officers) → Quality (only if 50+) → State → certificates issued automatically.**

### Pages and what you can do there
**1. Sign in** (http://localhost:8080)
- Pick a person, then **Continue**. No password (demo mode).
- The server gives a signed cookie and checks every action against that person's role, district and the batch's step.

**2. Home page** (changes by role)
- **Anika:** *New batch* form + *Your batches* (only her centre's).
- **Officers (Dev, Meera, Kabir, Neha):** *Waiting for you* (batches at your step) + *All batches you can see* (district officers: only their district).
- **Farah:** *Stuck: waiting too long* + *Waiting for you* + all batches.
- Click any batch to open it. Lists update by themselves (live updates).

**3. Batch page**
- Top: name, **status**, course, number of candidates, **cycle** (goes up after a send back), and the reason if sent back.
- **Anika (Draft or Sent back):**
  1. **Upload candidates**: CSV or Excel, columns `full_name, phone, date_of_birth (YYYY-MM-DD), course_code, score`.
     - Any bad row → every error listed with its row number, **nothing saved**.
     - All rows good → saved (still Draft). Uploading again replaces the list.
  2. **Send for approval** (or **Resend for approval** after a send back).
- **Officer at their step:** *Your decision* box: **Approve**, **Send back** or **Reject** (reason required for the last two).
  - First district approval → "waiting for another officer". Second (different officer) → batch moves on.
  - **Withdraw my approval**: take back your own approval while the batch is still at your step.
- **Certificates** (after final approval): number, holder, Valid/Cancelled, WhatsApp status (Pending → Sent / Failed, with tries).
  - **Farah:** **Cancel** (with a reason) and **Resend** (failed WhatsApp). **History** per certificate.
- **History** (bottom): every action with who, when and from which state to which. Cannot be edited.

**4. Public verify page** (http://localhost:8080/verify, no login)
- Type a number like `PSM-2026-000001`, then **Check**.
- **Valid** (masked name, course, date, centre) · **Cancelled** · **Not found**. No phone or date of birth is ever shown.

**5. WhatsApp stand-in** (http://localhost:4100/v1/messages)
- Shows the messages "sent" to students, one per certificate. Open a link to **download the PDF**. An edited link is refused.

### One full run, step by step (about 5 minutes)
1. **Anika:** New batch `Electricians Nov 2026`, course `ELEC-101` → Create.
2. **Anika:** upload `docs/demo/candidates-60-with-bad-rows.csv` → 4 errors, 0 saved.
3. **Anika:** upload `docs/demo/candidates-60-valid.csv` → 60 saved → **Send for approval**.
4. **Dev:** open it from *Waiting for you* → **Approve** → "waiting for another officer".
5. **Meera:** **Approve** → moves to **Quality review** (60 is 50 or more).
6. **Neha:** **Approve** → **State review**.
7. **Farah:** **Approve** → certificates appear; WhatsApp column moves to **Sent** (some take several tries: the stand-in fails on purpose).
8. Click a certificate number → **Valid** on the verify page.
9. **Farah:** **Cancel** that certificate with a reason → check again → **Cancelled**.

## Try it in 3 minutes

Open http://localhost:8080 and sign in as the person named below. These seven batches are already loaded (Hyderabad, course `ELEC-101`).

1. **Draft: ready to submit** — sign in as **Anika** and send it for approval.
2. **District: waiting for a second officer** — **Dev** has approved. Sign in as **Meera** or **Kabir** to finish the step.
3. **Quality: Neha's turn** — sign in as **Neha** (55 candidates, so quality review applies).
4. **State: Farah's turn** — sign in as **Farah**. Approving issues the certificates.
5. **Completed: certificates ready to check** — six certificates, already sent. The startup log prints their numbers. Open one at `/verify`.
6. **Stuck: waiting too long** — sign in as **Farah** and open **Stuck**.
7. **Sent back: fix and resend** — sign in as **Anika**, fix it, and resend. **Dev** must approve again.

## How it is put together

```
Browser ──/api──► Express API ──► PostgreSQL (Prisma)   ◄── source of truth: transactions + unique constraints
   ▲                 │   │
   │                 │   ├─ Redis cache ── verify lookups (key deleted on cancel)
   │                 │   │
   │                 │   └─ Redis pub/sub "certiflow:events" ──► GET /api/events (SSE) ──► browser
   │                 │
   │                 └─ writes OutboxEvent in the SAME transaction as the state change
   │                                  │
Worker ── outbox relay (SKIP LOCKED) ──► BullMQ "certiflow-events"  ──► issue certificates (idempotent)
       └──────────────────────────────► BullMQ "certiflow-delivery" ──► PDF + WhatsApp stand-in (retries, idempotency key)
       └── repeatable job every minute ─► escalate stuck batches
API and worker publish batch changes on Redis pub/sub, which /api/events streams to the browser.
```

| Piece | Why it is there |
|---|---|
| **PostgreSQL + Prisma migrations** | Every "never" rule ends in a constraint or transaction: `UNIQUE(candidateId)`, `UNIQUE(phone, courseCode)`, `UNIQUE(number)`, `UNIQUE(batch, step, officer, cycle)`, a number sequence, and a trigger that makes the audit log append-only. |
| **Row lock + version column** | A review runs in one transaction that first locks the batch row (`SELECT ... FOR UPDATE`); the move is `UPDATE ... WHERE version = ?`. Two officers at the same moment are processed one after the other, so the batch moves once. |
| **Transactional outbox** | "Batch approved" is saved with the batch. If the API dies right after, the event is still there; the relay publishes it later. |
| **BullMQ on Redis (the queue)** | Redis is already needed for caching. BullMQ adds retries with exponential backoff, job ids for de-duplication, repeatable jobs (escalation) and recovery of jobs from a crashed worker. Kafka or RabbitMQ would add an extra system for ~10 messages a second. |
| **Worker (separate container)** | Issuing 60 certificates and sending 60 messages never blocks Farah's click. Any number of workers can run (`docker compose up --scale worker=3`): every job is idempotent. |
| **Redis cache for verify** | Bursts of public lookups hit Redis first. On cancel the key is deleted in the same request; a 60 s TTL is the safety net. If Redis is down, verify falls back to the database. |
| **Live updates (SSE)** | When a batch changes, the API or worker publishes to Redis. `GET /api/events` forwards only the events that person may see. The screen also refreshes every 15 seconds if a message is missed. |
| **Signed cookie + server checks** | Role, district and current step are checked on every request, not by hiding buttons. Officers of another district get 404 (they cannot even learn the batch exists). |
| **Pino logs + request id + audit log** | Every response carries `x-request-id`; the same id is in the logs and in the audit record. Refused actions (403/409) are audited too. |

### Key flows (code map)
- Workflow rules in one place: `apps/api/src/domain/workflow.ts`
- CSV parsing and row validation: `apps/api/src/domain/csv.ts`
- Upload, submit: `apps/api/src/services/batches.ts` · Review (concurrency): `services/review.ts`
- Issuing, PDF, WhatsApp delivery: `services/certificates.ts` · Outbox relay: `services/outbox.ts`
- Verify and cancel: `services/verify.ts` · Escalation: `services/escalation.ts` · Worker: `src/worker.ts`
- Tests that prove the moments: `apps/api/tests/moments.test.ts`

## Tests

`npm test` (needs Postgres and Redis from Docker; uses a separate `certiflow_test` database).

| Brief | Test |
|---|---|
| Bad rows: exact errors, nothing saved | `Moment 1` (+ a bad re-upload keeps the previous good list) |
| Two officers at once move the batch once | `Moment 2` with `Promise.all` (2 and 3 officers), same officer twice counts once |
| 60 candidates → exactly 60 certificates on an unreliable WhatsApp | `Moment 3`: two workers issue at once + a retry; flaky provider (30% errors, 20% timeouts) |
| Cancelled shows invalid a minute later | `Moment 4`: warm cache, cancel, check → CANCELLED |
| Stuck batch found without chasing | `Moment 5`: escalates once, not twice |
| Send-back decision | `Moment 6`: old approvals stop counting, history kept; reject is final |
| Never: acting out of turn / as someone else | centre approving 403, other district 404, wrong step 409, tampered cookie 401 |
| Never: untraceable decision | audit row written; update/delete refused by the database |
| Never: stranger gets someone's certificate | signed, expiring download links; verify returns masked data only |

## Known limits and next steps

- Live updates use Server-Sent Events, with a 15-second refresh if a message is missed.
- Phone numbers are checked for format and duplicates, but not proven to belong to the candidate. If a centre enters a wrong number, the WhatsApp goes to the wrong person. Next step: OTP confirmation of each candidate's phone at enrolment, and a re-issue flow (cancel + issue to the corrected number).
- Verify rate limit is in memory per API instance; with several instances use a Redis store.
- PDFs are on a shared Docker volume; production uses S3 with pre-signed URLs (see DEPLOYMENT.md).
- No email/SMS fallback when WhatsApp fails permanently; the state office resends by hand.
- Escalation notifies only through the *Stuck* list; next: email/WhatsApp to the state office.
- Demo sign-in has no passwords by design (D9); production needs real identity (e.g. SSO / OTP).
- Uploading a person already certified for the course is refused; there is no "re-issue" flow yet.

See **SETUP.md**, **DEPLOYMENT.md**, **AI_USAGE.md** and `docs/user-stories.md`.
