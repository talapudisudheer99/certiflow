import { Queue, Worker } from "bullmq";
import { loadConfig } from "./config";
import { createRedis } from "./redis";
import { DELIVERY_QUEUE, EVENTS_QUEUE } from "./queues";
import { logger } from "./logger";
import { prisma } from "./db";
import { relayOutbox } from "./services/outbox";
import { deliverCertificate, httpSender, issueCertificates, markDeliveryFailed } from "./services/certificates";
import { escalateStuckBatches } from "./services/escalation";

/**
 * Background worker. Any number of copies can run: every job is idempotent, and a job that was
 * running when a worker died is picked up again by BullMQ (stalled-job recovery).
 */
const config = loadConfig();
const connection = createRedis(config.REDIS_URL);
const events = new Queue(EVENTS_QUEUE, { connection });
const deliveries = new Queue(DELIVERY_QUEUE, { connection });
const issueCfg = { hmacSecret: config.CERT_HMAC_SECRET, storageDir: config.STORAGE_DIR, publicBaseUrl: config.PUBLIC_BASE_URL };
const send = httpSender(config.WHATSAPP_URL);
const sla = { district: config.SLA_DISTRICT_MINUTES, quality: config.SLA_QUALITY_MINUTES, state: config.SLA_STATE_MINUTES };

async function queueDeliveries(certificateIds: string[], trace: { requestId?: string; batchId?: string } = {}) {
  if (certificateIds.length === 0) return;
  // jobId = certificate id: the same certificate is never queued twice at the same time.
  await deliveries.addBulk(
    certificateIds.map((id) => ({
      name: "deliver",
      data: { certificateId: id, requestId: trace.requestId, batchId: trace.batchId },
      opts: {
        jobId: `deliver-${id}`,
        attempts: config.DELIVERY_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    })),
  );
}

const eventsWorker = new Worker(
  EVENTS_QUEUE,
  async (job) => {
    const log = logger.child({ jobId: job.id, event: job.name });
    if (job.name === "batch.approved") {
      const traced = log.child({ requestId: job.data.requestId, batchId: job.data.batchId });
      const ids = await issueCertificates(job.data.batchId, issueCfg);
      traced.info({ toDeliver: ids.length }, "certificates issued");
      await queueDeliveries(ids, { requestId: job.data.requestId, batchId: job.data.batchId });
    } else if (job.name === "delivery.resend") {
      // A finished job keeps its id for a while; remove it so the resend can be queued.
      await deliveries.remove(`deliver-${job.data.certificateId}`).catch(() => undefined);
      await queueDeliveries([job.data.certificateId]);
    } else if (job.name === "escalate.check") {
      const ids = await escalateStuckBatches(sla);
      if (ids.length > 0) log.warn({ batchIds: ids }, "batches escalated");
    }
  },
  { connection, concurrency: 5 },
);

const deliveryWorker = new Worker(
  DELIVERY_QUEUE,
  async (job) => {
    const log = logger.child({
      requestId: job.data.requestId,
      batchId: job.data.batchId,
      certificateId: job.data.certificateId,
    });
    log.info("delivering certificate");
    return deliverCertificate(job.data.certificateId, issueCfg, send);
  },
  { connection, concurrency: 10 },
);

deliveryWorker.on("failed", async (job, err) => {
  if (!job) return;
  logger.warn({ jobId: job.id, attempt: job.attemptsMade, err: err.message }, "delivery attempt failed");
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) await markDeliveryFailed(job.data.certificateId, err.message);
});
eventsWorker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "event job failed"));

// Outbox relay: every second, move saved events onto the queue.
const relayTimer = setInterval(() => {
  relayOutbox(events).catch((err) => logger.error({ err }, "outbox relay failed"));
}, 1000);

// Stuck-batch check every minute (one schedule, however many workers run).
events
  .upsertJobScheduler("escalate-every-minute", { every: 60_000 }, { name: "escalate.check" })
  .catch((err) => logger.error({ err }, "could not schedule escalation"));

logger.info("worker started");

async function shutdown() {
  clearInterval(relayTimer);
  await Promise.all([eventsWorker.close(), deliveryWorker.close()]);
  await Promise.all([events.close(), deliveries.close()]);
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
