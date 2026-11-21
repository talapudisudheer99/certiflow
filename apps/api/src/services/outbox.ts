import type { Queue } from "bullmq";
import { prisma } from "../db";

/**
 * Outbox relay (US-7): moves events saved with a state change onto the queue.
 * FOR UPDATE SKIP LOCKED lets several worker instances relay in parallel without taking the
 * same event. The BullMQ job id is the event id, so publishing the same event twice (crash
 * between add and commit) creates only one job.
 */
export async function relayOutbox(queue: Queue, limit = 50) {
  return prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<{ id: string; type: string; payload: unknown }[]>`
      SELECT "id", "type", "payload" FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL ORDER BY "createdAt" LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    for (const e of events) {
      await queue.add(e.type, e.payload, { jobId: e.id, attempts: 5, backoff: { type: "exponential", delay: 1000 } });
      await tx.outboxEvent.update({ where: { id: e.id }, data: { publishedAt: new Date() } });
    }
    return events.length;
  });
}
