import { Queue } from "bullmq";
import { Router } from "express";
import { requireRole, requireUser, type UserStore } from "../auth";
import { prisma } from "../db";
import { DELIVERY_QUEUE, EVENTS_QUEUE } from "../queues";
import { createRedis } from "../redis";

const REVIEWING = ["DISTRICT_REVIEW", "QUALITY_REVIEW", "STATE_REVIEW"] as const;

/** State office numbers: queue depth, message outcomes, events not yet picked up, stuck batches. */
export function metricsRouter(users: UserStore, redisUrl: string) {
  const connection = createRedis(redisUrl);
  const events = new Queue(EVENTS_QUEUE, { connection });
  const deliveries = new Queue(DELIVERY_QUEUE, { connection });
  const router = Router();

  router.get("/metrics", requireUser(users), requireRole("STATE"), async (_req, res) => {
    const [eventCounts, deliveryCounts, byStatus, unpublishedOutbox, stuckBatches] = await Promise.all([
      events.getJobCounts("waiting", "active", "failed"),
      deliveries.getJobCounts("waiting", "active", "failed"),
      prisma.delivery.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.outboxEvent.count({ where: { publishedAt: null } }),
      prisma.batch.count({ where: { escalatedAt: { not: null }, status: { in: [...REVIEWING] } } }),
    ]);
    const deliveriesByStatus: Record<string, number> = {};
    for (const row of byStatus) deliveriesByStatus[row.status] = row._count._all;
    res.json({
      queues: {
        [EVENTS_QUEUE]: pick(eventCounts),
        [DELIVERY_QUEUE]: pick(deliveryCounts),
      },
      deliveries: deliveriesByStatus,
      unpublishedOutbox,
      stuckBatches,
    });
  });

  return router;
}

function pick(counts: { waiting?: number; active?: number; failed?: number }) {
  return { waiting: counts.waiting ?? 0, active: counts.active ?? 0, failed: counts.failed ?? 0 };
}
