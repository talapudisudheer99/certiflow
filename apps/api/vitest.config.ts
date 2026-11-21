import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests use their own database (certiflow_test) and Redis db 1, so demo data is never touched.
function readEnvFile(): Record<string, string> {
  const file = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8").split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}
const env = { ...readEnvFile(), ...process.env };
const base = env.DATABASE_URL ?? "postgresql://certiflow:change-me@localhost:5433/certiflow?schema=public";
const testDb = base.replace(/\/([^/?]+)(\?|$)/, "/certiflow_test$2");
const testRedis = `${(env.REDIS_URL ?? "redis://localhost:6379").replace(/\/\d+$/, "")}/1`;
process.env.TEST_DATABASE_URL = testDb; // read by tests/global-setup.ts

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDb,
      REDIS_URL: testRedis,
      CERT_HMAC_SECRET: "test-secret-test-secret-test-secret-123",
      LOG_LEVEL: "silent",
    },
  },
});
