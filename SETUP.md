# SETUP

## With Docker (recommended)
1. Install Docker Desktop.
2. `cp .env.example .env` and set the secrets (`openssl rand -hex 24`).
3. `docker compose up --build`
4. Open http://localhost:8080

## Without Docker (development)
1. Start Postgres and Redis (for example `docker compose up postgres redis`).
2. `npm run install:all`
3. `cd apps/api && npx prisma migrate dev && npx prisma db seed`
4. Terminals: `npm --prefix apps/api run dev`, `npm --prefix apps/api run dev:worker`,
   `npm --prefix apps/whatsapp-stub run dev`, `npm --prefix apps/web run dev`
5. Web: http://localhost:5173

## Tests
`npm test` (api unit and integration tests).
