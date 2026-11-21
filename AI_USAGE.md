# AI usage log

Rule I followed: I understand every line submitted. AI wrote drafts; I decided the design, reviewed
every file in Cursor, ran the tests and the full flow myself, and changed what I did not agree with.

| Tool | Where used | Why | How I checked it |
|---|---|---|---|
| Claude (chat + agent on my machine) | Turning the brief into user stories, decisions D1-D12 and the priority order | Fast first draft to argue with | Compared each decision with the brief's six moments and "never" list; kept only rules I can defend |
| Claude | Project skeleton: docker-compose, Dockerfiles, Prisma schema, demo sign-in | Save setup time | `docker compose up --build` from a fresh clone; read every config line |
| Claude | API services: CSV validation, review workflow with row lock + version, outbox relay, certificate issuing, WhatsApp delivery, verify/cancel, escalation | Write the code for each story quickly | Read each service; ran the tests that prove each moment; tried every flow in the browser as each person |
| Claude | Tests (`apps/api/tests`) | Cover the six moments and the "never" rules | Read every assertion against the brief; ran `npm test` until all passed |
| Claude | React screens (batch list/detail, upload errors, review actions, verify page) | UI with the shadcn components I already use | Clicked through every role; checked the server still refuses actions when called directly |
| Claude | README, SETUP.md, DEPLOYMENT.md drafts | Structure and wording | Edited to match what is really built; numbers in DEPLOYMENT.md recalculated |
| Cursor | Reviewing diffs, small fixes, navigation | Fast review in the editor | Same: tests + manual run |

## Things I verified by hand
- Two officers approving at the same time: the batch moves once (test with `Promise.all`).
- The audit log cannot be edited: a database trigger rejects UPDATE and DELETE.
- A cancelled certificate shows CANCELLED on the very next check (cache key deleted).
- The WhatsApp stand-in really fails and times out; the delivery column shows several tries, yet each person got one message (`/v1/messages` count equals certificates).
