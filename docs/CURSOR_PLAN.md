# CertiFlow: step-by-step plan for Cursor

**How to use:** do the steps in order. For each step, paste the **Prompt for Cursor** into Cursor
chat (Agent mode), let it work, then run the **Check** yourself. Only when the check passes, run the
**Commit** and move on. Deadline 2:30 pm; **stop building at 1:30 pm** and go to Step 12.

---

## Ground rules (Cursor: read these before every step)

- Brief: `docs/` + the official problem statement. Stories and decisions D1-D12: `docs/user-stories.md`, `README.md`.
- Stack is fixed: React + Vite (`apps/web`), Express + TypeScript (`apps/api`), PostgreSQL + Prisma
  migrations, Redis, BullMQ, Docker Compose. WhatsApp is the stand-in in `apps/whatsapp-stub`.
- **Do not rewrite working code.** Read it, run it, fix only what fails. Keep files small and commented.
- Every rule is enforced **on the server and in the database**, never only by hiding buttons.
- Zod on every input. Every state change writes an audit row in the same transaction.
- Never edit an applied migration: add a new folder in `apps/api/prisma/migrations/`.
- One meaningful commit per story/step.

### The six moments (must work and be tested)
1. Bad CSV rows: exact errors, nothing saved.
2. Two officers approve at once: batch moves once.
3. 60 candidates: exactly one certificate each, WhatsApp unreliable.
4. Cancelled certificate: verify says invalid at once.
5. Stuck batch: escalated without anyone chasing.
6. Send back + resend: approvals cleared (decision D4), documented.

### Never
Acting out of turn or as someone else · two certificates or a shared number · cancelled showing valid ·
stranger seeing someone else's data · a decision nobody can trace.

---

## Where things are (current state)

| Area | Files | State |
|---|---|---|
| Docker (6 services) | `docker-compose.yml`, `apps/*/Dockerfile` | written |
| DB schema + migrations | `apps/api/prisma/schema.prisma`, `prisma/migrations/*` (init + sequence + audit trigger) | applied locally |
| Seed (6 people, 1 sample batch) | `apps/api/src/demo-data.ts`, `prisma/seed.ts` | done |
| Sign-in (signed cookie) | `apps/api/src/auth.ts` | done + tests |
| Workflow rules | `apps/api/src/domain/workflow.ts` | written |
| CSV validation | `apps/api/src/domain/csv.ts` | written + tests |
| Batches, upload, submit | `apps/api/src/services/batches.ts`, `routes/batches.ts` | written |
| Review (row lock + version) | `apps/api/src/services/review.ts` | written |
| Outbox, issuing, PDF, WhatsApp | `services/outbox.ts`, `services/certificates.ts`, `lib/pdf.ts`, `worker.ts` | written |
| Verify, cancel, state tools | `services/verify.ts`, `routes/certificates.ts` | written |
| Escalation | `services/escalation.ts` (+ repeatable job in `worker.ts`) | written |
| Tests | `apps/api/tests/*.test.ts` | written, **not run yet** |
| Web screens | `apps/web/src/pages/*`, `components/batches/*`, `pages/verify-page.tsx` | written |
| Docs | `README.md`, `SETUP.md`, `DEPLOYMENT.md`, `AI_USAGE.md` | drafts |
| Live updates | `apps/web/src/hooks/use-poll.ts` | polling every 3 s (meets "without refreshing"); SSE is Step 5 |
| Sample data for every flow | - | **Step 4b** |
| Certificate end-to-end trace | - | **Step 4c** |
| Officer fixes own mistake (D13) | - | **Step 4d** |

---

## Step 0: Environment (10 min, you, not Cursor)

1. Start **Docker Desktop** and wait for "Engine running".
2. `.env` in the repo root must have these keys (already filled in your local `.env`; never commit it):

| Key | Example / rule |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `certiflow`, random, `certiflow` |
| `DATABASE_URL` | `postgresql://certiflow:<password>@localhost:5433/certiflow?schema=public` |
| `REDIS_URL` | `redis://localhost:6379` |
| `WHATSAPP_URL` | `http://localhost:4100` |
| `PORT` | `4000` |
| `SESSION_SECRET`, `CERT_HMAC_SECRET` | 48 random chars each: `openssl rand -hex 24` |
| `QUALITY_REVIEW_MIN_SIZE` | `50` (decision D1) |
| `SLA_DISTRICT_MINUTES`, `SLA_QUALITY_MINUTES`, `SLA_STATE_MINUTES` | `2880`, `2880`, `1440` (use `1` for the demo video) |
| `STUB_FAIL_RATE`, `STUB_TIMEOUT_RATE`, `STUB_TIMEOUT_MS` | `0.2`, `0.1`, `15000` |
| Optional: `PUBLIC_BASE_URL`, `STORAGE_DIR`, `DELIVERY_MAX_ATTEMPTS` | defaults `http://localhost:8080`, `storage`, `8` |

3. Logins: **none to set up.** The login page lists Anika, Dev, Meera, Kabir, Neha, Farah (seeded).
4. Commands:
```bash
cd ~/Desktop/certiflow
docker compose up -d postgres redis
npm run install:all
cd apps/api && set -a && source ../../.env && set +a
npx prisma migrate dev && npx prisma db seed
```
**Check:** `npx prisma migrate status` says "Database schema is up to date".

---

## Step 1: Tests green (20 min)

**Prompt for Cursor:**
> Read `CURSOR_PLAN.md` ground rules. In `apps/api`, run `npm test` (Postgres and Redis are running in
> Docker; tests use the `certiflow_test` database via `tests/global-setup.ts`). For every failing
> test, find the cause in the source (not in the test) unless the test itself is wrong about the
> brief. Fix with the smallest change, explain each fix in one line. Do not rewrite files. Then run
> `npm run typecheck` in `apps/api` and `apps/web`.

**Check:** `npm test` → all passed (about 30 tests: csv, auth, health, signing, moments).

**Commits** (split so each story has its own commit; run from repo root):
```bash
git add apps/api/prisma apps/api/src/demo-data.ts apps/api/src/config.ts docker-compose.yml apps/api/vitest.config.ts apps/api/tests/global-setup.ts apps/api/tests/helpers.ts
git commit -m "feat(US-1): migrations, certificate number sequence, append-only audit, idempotent seed, test database"
git add apps/api/src/domain/csv.ts apps/api/tests/csv.test.ts
git commit -m "feat(US-3): CSV row validation, all-or-nothing upload"
git add apps/api/src/domain/workflow.ts apps/api/src/lib/http.ts apps/api/src/lib/audit.ts apps/api/src/services/batches.ts apps/api/src/services/review.ts apps/api/src/routes/batches.ts
git commit -m "feat(US-4/5/12): workflow states, concurrent-safe district review, send back clears approvals"
git add apps/api/src/services/outbox.ts apps/api/src/services/certificates.ts apps/api/src/lib/pdf.ts apps/api/src/lib/signing.ts apps/api/src/queues.ts apps/api/src/worker.ts apps/api/src/redis.ts
git commit -m "feat(US-7/8): transactional outbox, idempotent certificate issuing, PDF, WhatsApp retries with idempotency key"
git add apps/api/src/services/verify.ts apps/api/src/routes/certificates.ts apps/api/src/services/escalation.ts
git commit -m "feat(US-6/9/11): public verify with cache, cancel, state tools, stuck-batch escalation"
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/auth.ts apps/api/prisma/seed.ts apps/api/tests
git commit -m "test: prove the six moments and the never rules; wire feature routes"
git push
```

---

## Step 2: Whole system in Docker (20 min)

**Prompt for Cursor:**
> Run `docker compose up --build` from the repo root. Fix any build or start-up error in the
> Dockerfiles, `docker-compose.yml` or start commands (api runs `prisma migrate deploy` + seed, worker
> runs `node dist/worker.js`). Requirements: api health `http://localhost:4000/api/health` returns
> `{"status":"ok"}`; web on `http://localhost:8080`; worker log shows "worker started"; the api and
> worker share the `certificates` volume at `/app/storage`.

**Check:** http://localhost:8080 shows the person picker; http://localhost:4000/api/health is ok.
**Commit:** `git commit -am "fix: docker build and start-up"` (only if something changed).

---

## Step 3: Web screens work for every role (40 min)

**Prompt for Cursor:**
> Using the running system, walk through the flow below in the browser and fix any UI or API
> mismatch in `apps/web/src` (types in `lib/batches.ts` must match the API responses). Keep the
> shadcn components and the current layout. Every page needs loading, empty and error states.
> Flow: Anika creates batch (ELEC-101) → uploads `docs/demo/candidates-60-with-bad-rows.csv` (must
> list 4 row errors and save nothing) → uploads `docs/demo/candidates-60-valid.csv` → sends for
> approval → Dev approves → Meera approves → Neha approves (quality, because 60 ≥ 50) → Farah
> approves → certificates appear and WhatsApp column moves to SENT → open a certificate number on
> /verify (Valid) → Farah cancels it → /verify shows Cancelled.

**Check (do it yourself):** the flow above works; also as Dev, an approved batch shows "waiting for
another officer"; as Anika, a sent-back batch shows the reason and "Resend for approval".
**Candidate download (brief: "can download it"):** open http://localhost:4100/v1/messages (what the
WhatsApp stand-in delivered), copy one message's link, open it: the PDF certificate downloads. Change
one character of `sig` in the link: it must say the link is invalid (403).
**Commit:** `git add apps/web && git commit -m "feat(web): batch screens, upload errors, review, certificates, verify page" && git push`

---

## Step 4: Send back + escalation by hand (15 min)

- Send back: as Dev approve, as Meera *Send back* with a reason → Anika sees the reason, re-uploads
  `docs/demo/candidates-5-valid.csv`, resends → batch history shows cycle 2; Dev must approve again.
- Escalation: set `SLA_DISTRICT_MINUTES=1` in `.env`, `docker compose up -d api worker`, submit a
  batch and wait ~2 minutes → Farah sees it under **Stuck**. Set it back to `2880` afterwards.

**Prompt for Cursor (only if something fails):**
> The <send back | escalation> flow fails: <what you saw>. Find the cause and fix it; add or adjust a
> test in `apps/api/tests/moments.test.ts` that reproduces it.

---

## Step 4b: Sample data for every flow (brief: "try every flow straight away") (25 min)

**Prompt for Cursor:**
> Extend `apps/api/src/demo-data.ts` (keep it idempotent: fixed ids, skip if the batch exists) so a
> reviewer can try every flow right after `docker compose up`, without doing the whole flow first.
> Seed these batches for centre `centre-hyd`, course `ELEC-101`, each with its own unique phone
> numbers, an audit row for every state it passed through, and approvals that match its state:
> 1. `DRAFT` with 5 candidates (Anika: submit it).
> 2. `DISTRICT_REVIEW` with 5 candidates and **Dev's approval already recorded** (Meera or Kabir completes it; Dev sees "already decided").
> 3. `QUALITY_REVIEW` with 55 candidates, approved by Dev and Meera (Neha's turn).
> 4. `STATE_REVIEW` with 8 candidates (Farah's turn; approving it issues certificates live).
> 5. `COMPLETED` with 6 candidates **and 6 certificates** (created through `issueCertificates` or the
>    same SQL, numbers from `certificate_number_seq`) and deliveries `SENT`, so /verify works at once.
> 6. `DISTRICT_REVIEW` entered 3 days ago with `escalatedAt` set (shows in Farah's *Stuck* list).
> 7. `RETURNED` with a reason, cycle 1, one old approval (Anika: fix and resend, decision D4).
> Print the certificate numbers of batch 5 at the end of the seed (for the verify demo). Add one test
> that running the seed twice creates nothing new. Update SETUP.md "Try the main flow" to list them.

**Check:** `docker compose down -v && docker compose up --build`, then sign in as each person: each one
has something waiting. **Commit:** `git commit -am "feat(US-1): sample data for every flow"`

---

## Step 4c: Trace any batch or certificate end to end (brief: "Observable") (25 min)

**Prompt for Cursor:**
> Make every batch and certificate traceable end to end, with no new dependencies:
> 1. When the outbox event `batch.approved` is written in `services/review.ts`, include `requestId`
>    in its payload. In `worker.ts`, create the child logger with `{ requestId, batchId, certificateId }`
>    so one search in the logs finds the click, the issuing and every WhatsApp attempt.
> 2. Audit each issued certificate (`CERTIFICATE_ISSUED`, entityType `certificate`) and each failed
>    WhatsApp attempt (`WHATSAPP_ATTEMPT_FAILED` with the error), in `services/certificates.ts`.
> 3. API: `GET /api/certificates/:id/history` for anyone who can see the batch (not only the state
>    office); move it out of `stateRouter` and check visibility with `getVisibleBatch`.
> 4. Web: in `certificates-table.tsx`, a "History" button opens a Dialog listing the certificate's
>    audit entries (reuse `HistoryList`).
> Add a test: after issuing and one failed + one successful delivery, the certificate history has
> ISSUED, ATTEMPT_FAILED, SENT in order.

**Commit:** `git commit -am "feat(US-10): end-to-end trace for certificates (audit + request id in worker logs)"`

---

## Step 4d: Officers can fix their own mistakes (brief: "Officers sometimes make mistakes") (20 min)

Decision **D13**: while the batch is still at their step, an officer can **withdraw their own
approval** (with a reason). Once the step is complete, mistakes are fixed by the next reviewer
sending it back, or after issuing by the state office cancelling the certificate. Nothing is deleted.

**Prompt for Cursor:**
> Implement decision D13. Add `WITHDRAW` to the `Decision` enum with a new migration (do not edit old
> ones). `POST /api/batches/:id/withdraw {reason}`: only the officer who approved, only while the batch
> is still at that step and cycle; inside the same locked transaction as `reviewBatch`, record a
> `WITHDRAW` row (keep the approval row; count approvals as APPROVE rows minus that officer's WITHDRAW)
> and an audit entry. If the step already moved on: 409 "The batch has moved on; ask the next reviewer
> to send it back". Web: "Withdraw my approval" button in `review-actions.tsx` when the current user
> has approved at this step. Tests: withdraw then another officer approves → batch does not move;
> withdraw after the batch moved → 409. Add D13 to the README decisions table.

**Commit:** `git commit -am "feat: officers can withdraw their own approval while the step is open (D13)"`

---

## Step 5 (if time before 12:45): Live updates with Server-Sent Events (40 min)

**Prompt for Cursor:**
> Build US-13 (live updates). API: `GET /api/events` (requires sign-in) streams Server-Sent Events.
> When a batch changes (submit, review, issuing, completed, cancel, escalation, delivery sent/failed),
> the api or worker publishes `{type, batchId, centreId, districtId}` to Redis channel
> `certiflow:events` (helper in `apps/api/src/lib/events.ts`). The SSE route subscribes with its own
> Redis connection and only forwards events this user may see (centre: own centre; district officer:
> own district; quality and state: all). Send a heartbeat comment every 25 s. Web: a `useLiveEvents`
> hook opens `EventSource('/api/events')` and calls the screen's `refresh()` on events; keep 3-second
> polling as a fallback at 15 s. nginx already has a non-buffering `/api/events` location. Add one
> test for the visibility filter. Update README decision D11 to "SSE via Redis pub/sub".

**Check:** two browser windows (Anika and Dev); Dev approves → Anika's page updates without refresh.
**Commit:** `git add -A apps && git commit -m "feat(US-13): live updates with Server-Sent Events via Redis pub/sub" && git push`

---

## Step 5b (optional, 20 min): Excel upload (brief: "the spreadsheet it already keeps")

**Prompt for Cursor:**
> Accept `.xlsx` as well as `.csv` in the upload. In the web app, read the first sheet with SheetJS
> (`xlsx` package) and convert it to CSV text in the browser, then send it to the same endpoint, so
> the server validation stays in one place. Update the upload hint and README decision D12.

**Commit:** `git commit -am "feat(US-3): accept Excel files"`

---

## Step 6 (optional, 15 min): Observability extras

**Prompt for Cursor:**
> Add `GET /api/metrics` (state office only): queue counts for both BullMQ queues (waiting, active,
> failed), deliveries by status, unpublished outbox events, stuck batches. Add `batchId` /
> `certificateId` to worker log lines. No new dependencies.

**Commit:** `git commit -am "feat(US-15): metrics endpoint and traceable worker logs"`

---

## Step 7: Fresh-clone check (15 min, by 1:30 pm)

```bash
cd /tmp && rm -rf certiflow-check && git clone https://github.com/talapudisudheer99/certiflow.git certiflow-check
cd certiflow-check && cp ~/Desktop/certiflow/.env .env
docker compose down -v 2>/dev/null; docker compose up --build
```
**Check:** the app starts with demo data from the clone alone. Then `docker compose down` and go
back to `~/Desktop/certiflow`.

---

## Step 12: Docs final (1:30 → 1:50)

**Prompt for Cursor:**
> Update `docs/user-stories.md`: set each story's Status to Done / Partly / Not built to match the
> code. Check `README.md` "Requirements note", "Known limits" and the test table match what really
> works (remove anything not built). Check `SETUP.md` commands are correct. Do not invent features.

You: read `AI_USAGE.md` and make it true in your own words.
**Commit:** `git add -A && git commit -m "docs: requirements note, setup, deployment plan, AI usage, story status" && git push`

---

## Step 13: Demo video, 2 minutes or less (1:50 → 2:05)

Record with QuickTime (File → New Screen Recording) or Loom. Script:
1. (10 s) "CertiFlow: approve it properly, issue it once, prove it is real."
2. (25 s) Anika uploads the bad CSV → 4 errors, nothing saved → valid CSV → send.
3. (25 s) Dev approves ("waiting for another officer") → Meera approves → moves to quality → Neha → Farah.
4. (25 s) Certificates appear; WhatsApp column retries and reaches SENT (stand-in fails on purpose).
5. (20 s) Verify page: Valid → Farah cancels → Cancelled immediately.
6. (15 s) Terminal: `npm test` passing, mention the concurrency and 60-certificate tests.

Upload to Google Drive → Share → **Anyone with the link**.

---

## Step 14: Submit (2:05 → 2:20, hard stop)

- Repo is **public**: https://github.com/talapudisudheer99/certiflow (open it in a private window).
- `git status` is clean and pushed.
- Form: https://forms.gle/rWx1qemA5RGPSMq89, with repo link, video link and clear answers.

---

## Timeline

| Time | Step |
|---|---|
| 10:20-10:40 | 0-1: environment, tests green, commits |
| 10:40-11:00 | 2: Docker full system |
| 11:00-11:45 | 3: web flow for every role |
| 11:45-12:00 | 4: send back + escalation by hand |
| 12:00-12:25 | 4b: sample data for every flow (**do not skip**: reviewers use it) |
| 12:25-12:50 | 4c: end-to-end trace |
| 12:50-13:10 | 4d: officers withdraw approval (D13) |
| 13:10-13:15 | buffer (5, 5b, 6 only if far ahead) |
| 13:15-13:30 | 7: fresh-clone check |
| 13:30-13:50 | 12: docs |
| 13:50-14:05 | 13: video |
| 14:05-14:20 | 14: submit |

## Answers for the 3 pm discussion
- **Why a queue?** Sending 60 WhatsApps can take minutes and fails often; the request returns at once and retries happen in the background.
- **Why an outbox?** DB and queue are separate systems; the event is saved in the same transaction as the approval, so a crash cannot lose it.
- **How do two approvals move once?** Row lock on the batch inside one transaction, plus `UPDATE ... WHERE version = ?`, plus `UNIQUE(batch, step, officer, cycle)`.
- **How is a duplicate certificate impossible?** Issue only for candidates without one, `ON CONFLICT DO NOTHING`, unique constraints on candidate, (phone, course) and number; WhatsApp idempotency key = certificate id.
- **Why BullMQ over Kafka/RabbitMQ?** Redis is already there for caching; BullMQ gives retries, backoff, job-id de-duplication, repeatable jobs and stalled-job recovery. Kafka is oversized for ~10 messages/second.
- **Known limits:** see README; say them before they ask.
