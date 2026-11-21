import { prisma } from "../db";
import { audit } from "../lib/audit";
import { slaMinutes, stepOf } from "../domain/workflow";
import { publishBatchChange } from "../lib/events";

export type SlaConfig = { district: number; quality: number; state: number };

/**
 * Finds batches waiting longer than their step's limit and escalates each one once (moment 5).
 * Runs every minute as a repeatable queue job. Safe to run twice at the same time: the update
 * only matches rows where escalatedAt is still null.
 */
export async function escalateStuckBatches(sla: SlaConfig, now = new Date()) {
  const waiting = await prisma.batch.findMany({
    where: { status: { in: ["DISTRICT_REVIEW", "QUALITY_REVIEW", "STATE_REVIEW"] }, escalatedAt: null },
    select: { id: true, status: true, stepEnteredAt: true },
  });
  const escalated: string[] = [];
  for (const b of waiting) {
    const step = stepOf(b.status)!;
    const limitMs = slaMinutes(step, sla) * 60_000;
    if (now.getTime() - b.stepEnteredAt.getTime() < limitMs) continue;
    await prisma.$transaction(async (tx) => {
      const r = await tx.batch.updateMany({ where: { id: b.id, escalatedAt: null, status: b.status }, data: { escalatedAt: now } });
      if (r.count === 1) {
        escalated.push(b.id);
        await audit(tx, {
          actor: null, action: "BATCH_ESCALATED", entityType: "batch", entityId: b.id, fromState: b.status,
          reason: `Waiting at ${step.toLowerCase()} step longer than ${slaMinutes(step, sla)} minutes`,
        });
      }
    });
  }
  for (const id of escalated) void publishBatchChange("batch.escalated", id);
  return escalated;
}
