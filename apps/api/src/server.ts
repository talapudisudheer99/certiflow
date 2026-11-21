import { createApp } from "./app";
import { loadConfig } from "./config";
import { prisma } from "./db";
import { createRedis } from "./redis";
import { logger } from "./logger";

const config = loadConfig();
const redis = createRedis(config.REDIS_URL);

const app = createApp({
  sessionSecret: config.SESSION_SECRET,
  secureCookies: config.NODE_ENV === "production",
  users: {
    listUsers: () =>
      prisma.user.findMany({ select: { id: true, name: true, role: true, districtId: true }, orderBy: { name: "asc" } }),
    findUser: (id) =>
      prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, districtId: true } }),
  },
  checkDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  checkRedis: async () => {
    await redis.ping();
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
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
