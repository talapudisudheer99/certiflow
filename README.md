# CertiFlow

Skilling-certificate issuance and verification platform (Algohire hackathon, 21 Nov 2026).

## Requirements note (read first)

> TODO before submitting: 5 to 10 lines. What is built, what is not, the decisions made
> (see `docs/user-stories.md` D1 to D11), and the known limits.

## Run it

```bash
cp .env.example .env     # a ready .env already exists locally; never commit it
docker compose up --build
```

- Web: http://localhost:8080
- API health: http://localhost:4000/api/health

## Architecture

React + Vite (web) -> Express + TypeScript (api) -> PostgreSQL (Prisma). Redis for cache and
pub/sub. BullMQ (on Redis) is the queue: the api writes events to an outbox table, a relay
publishes them, and the worker processes them idempotently. A stand-in WhatsApp service can fail
and time out. TODO: add a diagram and the "why BullMQ" explanation.

## Tests

```bash
npm run install:all && npm test
```

See `SETUP.md`, `DEPLOYMENT.md`, `AI_USAGE.md` and `docs/user-stories.md`.
