# SETUP

From a fresh clone to a running system with demo data and passing tests.

## Requirements
- Docker Desktop (running)
- Node.js 20+ (only for running the tests or developing without Docker)

## 1. Run everything (one command)

```bash
git clone https://github.com/talapudisudheer99/certiflow.git && cd certiflow
cp .env.example .env
# set two secrets (any 48-character random strings):
#   SESSION_SECRET=$(openssl rand -hex 24)   CERT_HMAC_SECRET=$(openssl rand -hex 24)
docker compose up --build
```

This starts postgres, redis, api, worker, whatsapp-stub and web. The api runs the migrations and
the seed automatically (the seed is idempotent, so restarting is safe).

- Web app: **http://localhost:8080** → pick a person (Anika, Dev, Meera, Kabir, Neha, Farah)
- Public verify page: http://localhost:8080/verify
- API health: http://localhost:4000/api/health
- What the WhatsApp stand-in "sent": http://localhost:4100/v1/messages

## 2. Try the main flow (about 3 minutes)

After startup these batches are already there (centre Hyderabad, course `ELEC-101`). Signing in twice does not create them again.

1. **Draft: ready to submit** — Anika submits it.
2. **District: waiting for a second officer** — Dev has already approved. Meera or Kabir finishes the step. Dev sees that he already decided.
3. **Quality: Neha's turn** — 55 candidates, approved by Dev and Meera.
4. **State: Farah's turn** — 8 candidates. Approving it issues certificates.
5. **Completed: certificates ready to check** — 6 certificates, already sent. The seed prints their numbers. Open one on `/verify`.
6. **Stuck: waiting too long** — entered district review 3 days ago. Farah sees it under **Stuck**.
7. **Sent back: fix and resend** — a reason and Dev's old approval. Anika fixes and resends; Dev must approve again (decision D4).

You can also do the whole path by hand:

1. **Anika** → *New batch* (`Electricians Nov`, course `ELEC-101`) → upload
   `docs/demo/candidates-60-with-bad-rows.csv`: 4 errors listed, nothing saved.
   Upload `docs/demo/candidates-60-valid.csv` → 60 saved → *Send for approval*.
2. **Dev** → approve. **Meera** → approve (two officers) → moves to quality (60 ≥ 50).
3. **Neha** → approve. **Farah** → approve → certificates are issued and sent in the background.
   Watch the WhatsApp column go to SENT (some take several tries: the stand-in fails on purpose).
4. Click a certificate number → public verify page shows **Valid**. As **Farah**, *Cancel* it →
   the verify page shows **Cancelled** on the next check.
5. Stuck batches: set `SLA_DISTRICT_MINUTES=1` in `.env`, restart (`docker compose up -d`), leave a
   batch in district review for a minute; Farah sees it under *Stuck*.

## 3. Run the tests

Tests use real Postgres and Redis (they test concurrency and constraints), in a separate database
`certiflow_test`, so demo data is untouched.

```bash
docker compose up -d postgres redis
npm run install:all
cd apps/api && npx prisma generate && cd ../..
npm test
```

## 4. Develop without Docker for the apps

```bash
docker compose up -d postgres redis whatsapp-stub
npm run install:all
cd apps/api
set -a; source ../../.env; set +a
npx prisma migrate dev && npx prisma db seed
npm run dev            # api on :4000
npm run dev:worker     # in a second terminal
cd ../web && npm run dev   # web on http://localhost:5173
```

## Troubleshooting
- `Cannot connect to the Docker daemon`: start Docker Desktop first.
- Port 5433/6379/8080 already in use: stop the other service or change the port in `docker-compose.yml`.
- Reset all data: `docker compose down -v` (removes the database volume).
