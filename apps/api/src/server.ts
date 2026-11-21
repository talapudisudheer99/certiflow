import { createApp } from "./app";
import { loadConfig } from "./config";
import { prisma } from "./db";
import { createCacheRedis, createRedis } from "./redis";
import { logger } from "./logger";

const config = loadConfig();
const redis = createRedis(config.REDIS_URL);
// Separate client for the verify cache that fails fast instead of queueing when Redis is down,
// so verification falls back to the database (US-9).
const cache = createCacheRedis(config.REDIS_URL);

const app = createApp({
  sessionSecret: config.SESSION_SECRET,
  secureCookies: config.NODE_ENV === "production",
  users: {
    listUsers: () =>
      prisma.user.findMany({ select: { id: true, name: true, role: true, districtId: true, centreId: true }, orderBy: { name: "asc" } }),
    findUser: (id) =>
      prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, districtId: true, centreId: true } }),
  },
  checkDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  checkRedis: async () => {
    await redis.ping();
  },
  features: {
    redis: cache,
    qualityMinSize: config.QUALITY_REVIEW_MIN_SIZE,
    hmacSecret: config.CERT_HMAC_SECRET,
    publicBaseUrl: config.PUBLIC_BASE_URL,
  },
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "api listening");
});

// Stop cleanly so in-flight requests finish when a container restarts.
async function shutdown() {
  logger.info("shutting down");
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  cache.disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
