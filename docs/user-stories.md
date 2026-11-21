# User stories: CertiFlow (Pragati Skills Mission certificate platform)

Source: Algohire hackathon problem statement, 21 Nov 2026. Deadline 2:30 pm (final).
Stories are in priority order. **Tier A = must work and be tested. Tier B = do if time remains. Tier C = write it down (README / DEPLOYMENT.md), do not build.**
Status: Done / Partly / Not built

## Scope and decisions (where the brief was unclear)

These go to the top of the README as the "requirements note". Change a decision only if you write down why.

| # | Question in the brief | Decision | Why |
|---|---|---|---|
| D1 | What is a "big batch"? | 50 or more candidates goes to quality review too (env `QUALITY_REVIEW_MIN_SIZE=50`). The 60-candidate moment therefore passes quality review. | The brief says big batches need extra scrutiny but gives no number. Configurable. |
| D2 | "More than one officer must agree" | Two **different** officers of the **same district** must approve. Same officer twice does not count. | Prevents one person approving alone. |
| D3 | One officer rejects while another approves | Any one **reject** ends the batch (final, centre must create a new batch). Any one **send back** returns it to the centre. Approvals only count towards the two needed. | Simple, safe, easy to explain. |
| D4 | What happens to approvals when a batch is sent back and fixed? | **All earlier approvals are cleared.** The batch restarts at district review. Old decisions stay in the audit log. | The content changed, so earlier approvals no longer apply to what is being approved. |
| D5 | Quality team and state office approvals | One approval each (any quality-team member, any state-office member). | The brief asks for extra scrutiny and a final say, not more agreement. |
| D6 | "One certificate per candidate" | A candidate is unique by (phone number, course code). Uploading the same person for the same course again is rejected as a duplicate. Certificates have a unique number `PSM-<year>-<6 digits>` from a database sequence. | Makes "never two certificates" enforceable by a database constraint. |
| D7 | "Too long" with an officer | Per-step limits (env, short in demo): district 48 h, quality 48 h, state 24 h. After the limit the batch is **escalated** to the state office and flagged "stuck". | Gives a clear rule that can be tested. |
| D8 | Who can cancel a certificate | State office only, with a reason. The record stays, its status becomes `CANCELLED`, and verification says so immediately. | Never delete: the audit trail must survive. |
| D9 | Login | No passwords. The demo has a **person switcher** (Anika, Dev, Meera, Kabir, Neha, Farah). The server issues a signed session cookie and checks role, district and batch step on every request. | The brief asks reviewers to switch people. Real login is out of scope. |
| D10 | WhatsApp | A separate stand-in provider service that can succeed, fail, time out and send duplicates. We retry with backoff and use an idempotency key. | Real WhatsApp is unreliable, so correctness must not depend on it. |
| D11 | "See changes without refreshing" | Server-Sent Events from the API, fed by Redis pub/sub. Screens also poll every 15 seconds if a message is missed. | Simpler than WebSockets, one-way is enough. |

## Stack (fixed by the brief)
React + Vite (web), Node.js + Express + TypeScript (api and worker), PostgreSQL with Prisma (migrations), Redis (cache, pub/sub), BullMQ on Redis (jobs and events), Docker Compose (one command).

## Template

```
## US-<n>: <title>
As a <role>, I want <goal>, so that <benefit>.

Acceptance criteria:
- ...

Edge cases:
- ...

DB changes: tables, columns, constraints

Status: Done / Partly / Not built
```

---

# Tier A: must work and be tested

## US-1: One command starts the whole system
As a reviewer, I want to run one command from a fresh clone, so that I can try the system and its tests quickly.

Acceptance criteria:
- `docker compose up --build` starts web, api, worker, whatsapp-stub, postgres and redis.
- Migrations run automatically and demo data is seeded (6 people, 2 districts, 1 centre, sample batches).
- `GET /health` on the api reports database and Redis status.
- `SETUP.md` explains: clone, one command, open the URL, run tests (`npm test`).

Edge cases:
- Services start in the wrong order: api and worker wait for postgres and redis (healthchecks).
- Run twice: seed is idempotent (no duplicates).

DB changes: Prisma migration folder, `seed.ts`.

Status: Done

## US-2: Demo people and role-based access
As a reviewer, I want to switch between Anika, Dev, Meera, Kabir, Neha and Farah, so that I can try every flow, and as the programme office I want the server to stop anyone acting out of turn.

Acceptance criteria:
- A person switcher sets a signed, HttpOnly session cookie. The server reads the person from the cookie, never from the request body.
- Roles: `CENTRE`, `DISTRICT_OFFICER`, `QUALITY`, `STATE`. Officers belong to a district. A centre belongs to a district.
- Every endpoint checks role, district and the batch's current step. Wrong role, wrong district or wrong step returns 403 with a clear message.
- A centre only sees its own batches. A district officer only sees batches of their district.

Edge cases:
- Tampered or missing cookie returns 401.
- An officer from another district tries to approve a batch: 403.
- A centre tries to approve its own batch: 403.

DB changes: `users` (id, name, role, district_id, centre_id), `districts`, `centres`.

Status: Done

## US-3: Centre uploads candidates from a spreadsheet (all or nothing)
As a training centre, I want to upload my CSV of passed candidates, so that I do not retype them, and I want to see exactly which rows are wrong.

Acceptance criteria:
- Create a batch (name, course code), then upload a CSV (columns: full name, phone, date of birth, course code, score).
- The server validates **every** row with Zod and returns a list of errors with row number and reason.
- If any row is bad, **nothing is saved** (one database transaction). The centre fixes the file and uploads again.
- If all rows are valid, the candidates are saved in `DRAFT` status.

Edge cases:
- Bad phone number, empty name, score out of range, wrong course code, duplicate phone inside the file.
- Candidate already certified for this course (D6): rejected with a clear message.
- Empty file, wrong columns, very large file (limit rows, e.g. 5,000), wrong file type.
- Upload to a batch that is not in `DRAFT` or `RETURNED`: 409.

DB changes: `batches` (id, centre_id, status, version, ...), `candidates` (id, batch_id, full_name, phone, course_code, score, unique (phone, course_code)).

Status: Done

## US-4: Workflow with clear states
As a centre, I want to send the batch for approval and see where it is, so that I know what to do next.

Acceptance criteria:
- States: `DRAFT`, `DISTRICT_REVIEW`, `QUALITY_REVIEW` (only if size is 50 or more, D1), `STATE_REVIEW`, `APPROVED`, `ISSUING`, `COMPLETED`, `RETURNED`, `REJECTED`.
- Only the allowed transitions exist, in one function. Anything else is refused.
- The centre sees the current step, who has acted, and the reason when returned.
- Every transition writes an audit record (US-10).

Edge cases:
- Submit an empty batch: refused.
- Submit twice (double click): the second call changes nothing and does not error.

DB changes: `batches.status`, `batches.version` (for optimistic locking), `batches.step_entered_at`.

Status: Done

## US-5: District review with two officers (and safe concurrency)
As a district officer, I want to see what is waiting for me and approve, reject or send back with a reason, and as the programme office I want a batch to move forward once even if two officers click at the same moment.

Acceptance criteria:
- Officers see a queue of batches in `DISTRICT_REVIEW` for their district.
- Approve: records one approval. After two **different** officers have approved (D2), the batch moves forward **exactly once**.
- Reject or send back requires a reason (D3).
- Same officer approving twice counts once.

Edge cases:
- Moment 2: Dev and Meera approve at the same time. Use a unique constraint on (batch, step, officer) and a conditional update `WHERE status = 'DISTRICT_REVIEW' AND version = ?`. Only one request performs the transition. Test it with `Promise.all`.
- An officer acts on a batch that already moved on: 409 with a clear message.
- Officer approves after a send back: old approvals are cleared (D4).

DB changes: `approvals` (id, batch_id, step, officer_id, decision, reason, created_at, cycle, unique (batch_id, step, officer_id, cycle)).

Status: Done

## US-6: State office final decision, stuck list and cancel
As the state office, I want to give the final approval, see what is stuck, and cancel a certificate that should never have been issued.

Acceptance criteria:
- Farah sees batches in `STATE_REVIEW` and can approve, reject or send back (with reason).
- Farah sees a "stuck" list (US-11).
- Cancel a certificate: reason required, status becomes `CANCELLED`, recorded in the audit log with who and when.
- Only the state office can cancel (403 for everyone else).

Edge cases:
- Cancel twice: second call changes nothing.
- Cancel a certificate that does not exist: 404.

DB changes: `certificates.status`, `certificates.cancelled_at`, `certificates.cancel_reason`, `certificates.cancelled_by`.

Status: Done

## US-7: Exactly one certificate per candidate after approval
As a candidate, I want exactly one certificate, and as the programme office I want no duplicates and no shared numbers even if workers crash and retry.

Acceptance criteria:
- When the state office approves, the batch moves to `APPROVED` and an event is written in the **same database transaction** (transactional outbox). A worker publishes it to the queue.
- A worker creates one certificate per candidate with a unique number `PSM-<year>-<6 digits>` (database sequence).
- Unique constraint on `certificates.candidate_id` and on `certificates.number`.
- PDF is generated in the worker (not in the web request). The batch becomes `COMPLETED` when all candidates have a certificate.
- Moment 3: a batch of 60 ends with exactly 60 certificates, even if jobs are retried or run twice.

Edge cases:
- Worker crashes half-way and restarts: it resumes, creates only the missing certificates.
- Same job delivered twice: second run does nothing (idempotent, job id derived from candidate id).
- Two workers run the same job: the unique constraint stops the second insert.

DB changes: `certificates` (id, number unique, candidate_id unique, batch_id, status, issued_at, pdf_path, hash), `outbox` (id, type, payload, created_at, published_at).

Status: Done

## US-8: WhatsApp delivery through an unreliable stand-in provider
As a candidate, I want my certificate on WhatsApp, and as the programme office I want delivery to survive failures and timeouts without duplicates.

Acceptance criteria:
- A `whatsapp-stub` service behaves like a real provider: it can return success, error, time out, and (sometimes) report success twice.
- The worker sends one message per certificate with an **idempotency key** (the certificate id). Timeouts and errors are retried with exponential backoff. After N tries it is marked `FAILED` and appears for the state office.
- Delivery state per certificate: `PENDING`, `SENT`, `FAILED`.
- A "resend" action for failed deliveries (state office).
- The candidate can also download the certificate (US-14).

Edge cases:
- Provider times out but actually delivered: retrying with the same idempotency key must not send a second message.
- Provider is down for a long time: jobs wait, the web app stays fast.

DB changes: `deliveries` (id, certificate_id unique, status, attempts, last_error, next_attempt_at).

Status: Done

## US-9: Anyone can verify a certificate (no login)
As an employer, I want to check a certificate in seconds, and as the programme office I want a cancelled certificate to never look genuine.

Acceptance criteria:
- Public page and API: enter the certificate number (or open the QR link). Result: `VALID`, `CANCELLED` or `NOT FOUND`.
- Valid shows only minimal data: masked name (for example "A*** K***"), course, issue date, issuing centre. No phone, no date of birth.
- Moment 4: after the state office cancels, the next check shows `CANCELLED` (cache is cleared on cancel, or cache TTL is a few seconds).
- Rate-limited per IP so numbers cannot be guessed in bulk.
- Public endpoint reads from Redis cache first, then the database.

Edge cases:
- Bad format number: 400 without touching the database.
- Number guessing: rate limit returns 429.
- Redis down: falls back to the database.

DB changes: none (index on `certificates.number`).

Status: Done

## US-10: Every decision is traceable
As the programme office, I want to know who decided what and when, for any batch or certificate.

Acceptance criteria:
- An append-only `audit_log` (no update or delete from the app): id, timestamp, actor, action, entity type, entity id, from state, to state, reason, request id.
- A page shows the full history of a batch and of a certificate (US-14).
- Each request gets a request id, used in logs and in the audit record.

Edge cases:
- A failed action (403, 409) is also logged with the reason (without personal data).

DB changes: `audit_log`.

Status: Done

## US-11: Stuck batches are escalated automatically
As a senior officer, I want to learn about a batch waiting too long without anyone chasing it.

Acceptance criteria:
- A repeatable job runs every minute and finds batches where `now - step_entered_at` is over the limit for that step (D7).
- It escalates once: sets an `escalated_at`, writes an audit record, and shows the batch in the state office's "stuck" list (and pushes a live event).
- Demo setting: limits in minutes through env so it can be shown in the video.

Edge cases:
- Already escalated batches are not escalated again.
- Batch moves on after escalation: it leaves the list.

DB changes: `batches.escalated_at`.

Status: Done

## US-12: Send back, fix and resend
As a centre, I want to fix a batch that was sent back and resend it, with the decision about earlier approvals clear.

Acceptance criteria:
- A returned batch shows the reason. The centre can edit candidates (re-upload or edit rows) and resubmit.
- Decision D4: all earlier approvals are cleared and the batch restarts at district review, with a `cycle` counter increased. The old approvals stay in the history.
- The README explains this decision.

Edge cases:
- Resubmit without any change: allowed, but recorded.
- Reject (final) cannot be resubmitted.

DB changes: `batches.cycle`.

Status: Done

---

# Tier B: do if time remains

## US-13: Live updates without refreshing
As any user, I want to see changes as they happen.

Acceptance criteria:
- The api exposes `GET /events` (Server-Sent Events). The worker and api publish to Redis pub/sub. The web app updates lists and status when events arrive.
- A user receives only events they are allowed to see.

Edge cases: connection drops, the browser reconnects and refetches.

Status: Done

## US-14: Candidate download and history view
As a candidate (or centre), I want to download the PDF, and as an officer I want to see a batch's history.

Acceptance criteria:
- Download uses a short-lived signed link. A stranger cannot fetch someone else's PDF by guessing an id.
- A history page shows the audit log for a batch or a certificate.

Status: Done

## US-15: Basic observability
As an operator, I want to trace what happened and see health.

Acceptance criteria:
- Structured JSON logs with request id, batch id and certificate id.
- `/health` and a simple `/metrics` (queue depth, failed deliveries, stuck batches).

Status: Done

---

# Tier C: document only

- **DEPLOYMENT.md:** architecture diagram, hosting choices and why, scaling (what scales horizontally, the peak bottleneck of 30,000 PDFs and messages in an hour, how the backlog clears), failure handling (worker crash, Redis restart, WhatsApp outage, slow database), certificate file storage and access, monitoring and alerts, rough monthly cost and trade-offs.
- **Known limits and next steps:** an honest list in the README (what is not built, known bugs).

# Always-on rules (these are scored)

1. **Tests prove the six moments and the five "never" rules.** At least: bad CSV saves nothing, concurrent approvals move once, 60 candidates get exactly 60 certificates with a flaky provider, cancelled certificate is invalid immediately, stuck batch escalates, send back clears approvals.
2. **Meaningful commits**, one per story or step.
3. **AI usage log** (`AI_USAGE.md`): which tool, where, why, how the output was checked. Understand every line you submit.
4. **Submit before 2:30 pm** through the form (public GitHub repo and a public demo video of 2 minutes or less). Leave 15 to 20 minutes for the form.

<!-- Add notes below as you build. -->
