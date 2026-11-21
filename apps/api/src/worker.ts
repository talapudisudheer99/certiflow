import { Worker } from "bullmq";
import { loadConfig } from "./config";
import { createRedis } from "./redis";
import { EVENTS_QUEUE } from "./queues";
import { logger } from "./logger";

const config = loadConfig();
const connection = createRedis(config.REDIS_URL);

// Placeholder processor. Real handlers (issue certificates, send WhatsApp, escalate stuck
// batches) are added per user story. Jobs must be idempotent: a job can run twice.
const worker = new Worker(
  EVENTS_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "event received (placeholder)");
  },
  { connection, concurrency: 5 },
);

worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
logger.info("worker started");

async function shutdown() {
  await worker.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
