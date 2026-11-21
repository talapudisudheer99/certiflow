import { execSync } from "node:child_process";

// Creates/updates the test database with the same migrations as production.
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
