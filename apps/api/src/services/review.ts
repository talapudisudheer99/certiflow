import type { Decision } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { badRequest, conflict, forbidden } from "../lib/http";
import type { Person } from "../auth";
import { APPROVALS_NEEDED, ROLE_FOR_STEP, canTransition, statusAfterStep, stepOf } from "../domain/workflow";
import { getVisibleBatch, lockBatch } from "./batches";

type Ctx = { user: Person; requestId?: string };
export type ReviewInput = { decision: Decision; reason?: string };

/**
 * An officer approves, rejects or sends back a batch (US-5, US-6, decisions D2-D5).
 *
 * Concurrency (moment 2): the whole decision runs in one transaction that first takes a row
 * lock on the batch (SELECT ... FOR UPDATE). Two officers clicking at the same moment are
 * therefore processed one after the other: the second sees the first's approval, and the
 * batch moves forward exactly once. The status change is also guarded by the version column
 * (UPDATE ... WHERE version = ?), and a unique key on (batch, step, officer, cycle) means the
 * same officer can never count twice.
 */
export async function reviewBatch(ctx: Ctx, batchId: string, input: ReviewInput, qualityMinSize: number) {
  const reason = input.reason?.trim() || null;
  if (input.decision !== "APPROVE" && !reason) throw badRequest("A reason is required to reject or send back");

  // Visibility first: an officer of another district gets 404, not a hint that it exists.
  await getVisibleBatch(ctx.user, batchId);

  return prisma.$transaction(async (tx) => {
    const batch = await lockBatch(tx, batchId);
    const step = stepOf(batch.status);

    const reviewerSteps = Object.entries(ROLE_FOR_STEP).filter(([, role]) => role === ctx.user.role);
    if (reviewerSteps.length === 0) throw forbidden("Your role cannot review batches");
    if (!step) throw conflict(`This batch is not waiting for a review (it is ${batch.status})`);
    if (ROLE_FOR_STEP[step] !== ctx.user.role) {
      throw conflict(`This batch is at the ${step.toLowerCase()} step, not yours (it may have moved on)`);
    }

    // Same officer, same step, same cycle: their decision is already recorded. No-op.
    const mine = await tx.approval.findFirst({
      where: { batchId, step, officerId: ctx.user.id, cycle: batch.cycle, decision: "APPROVE" },
    });
    if (mine) return { batch, moved: false, alreadyDecided: true };

    await tx.approval.create({
      data: { batchId, step, officerId: ctx.user.id, decision: input.decision, reason, cycle: batch.cycle },
    });
    await audit(tx, {
      actor: ctx.user, action: `REVIEW_${input.decision}`, entityType: "batch", entityId: batchId,
      fromState: batch.status, reason: reason ?? `${step} approval`, requestId: ctx.requestId,
    });

    let next = batch.status;
    if (input.decision === "REJECT") next = "REJECTED";
    else if (input.decision === "SEND_BACK") next = "RETURNED";
    else {
      const [approves, withdrawn] = await Promise.all([
        tx.approval.count({ where: { batchId, step, cycle: batch.cycle, decision: "APPROVE" } }),
        tx.approval.count({ where: { batchId, step, cycle: batch.cycle, decision: "WITHDRAW" } }),
      ]);
      const approvals = approves - withdrawn;
      if (approvals >= APPROVALS_NEEDED[step]) {
        const size = await tx.candidate.count({ where: { batchId } });
        next = statusAfterStep(step, size, qualityMinSize);
      }
    }
    if (next === batch.status) return { batch, moved: false, alreadyDecided: false };
    if (!canTransition(batch.status, next)) throw conflict(`Cannot move from ${batch.status} to ${next}`);

    // Optimistic guard on top of the lock: only the request that saw this exact version moves it.
    const moved = await tx.batch.updateMany({
      where: { id: batchId, status: batch.status, version: batch.version },
      data: {
        status: next,
        version: { increment: 1 },
        stepEnteredAt: new Date(),
        escalatedAt: null,
        returnReason: next === "RETURNED" || next === "REJECTED" ? reason : null,
      },
    });
    if (moved.count !== 1) throw conflict("Someone else changed this batch at the same time, please reload");

    await audit(tx, {
      actor: ctx.user, action: "BATCH_MOVED", entityType: "batch", entityId: batchId,
      fromState: batch.status, toState: next, reason, requestId: ctx.requestId,
    });

    // Transactional outbox (US-7): the event is saved with the state change, never lost.
    if (next === "APPROVED") {
      await tx.outboxEvent.create({ data: { type: "batch.approved", payload: { batchId, requestId: ctx.requestId ?? null } } });
    }
    const updated = await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
    return { batch: updated, moved: true, alreadyDecided: false };
  });
}

/**
 * An officer takes back their own approval while the batch is still at their step (decision D13).
 * The approval row is kept. A withdrawal row means it no longer counts.
 */
export async function withdrawApproval(ctx: Ctx, batchId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 3) throw badRequest("A reason is required to withdraw an approval");
  await getVisibleBatch(ctx.user, batchId);

  return prisma.$transaction(async (tx) => {
    const batch = await lockBatch(tx, batchId);
    const step = stepOf(batch.status);
    if (!step || ROLE_FOR_STEP[step] !== ctx.user.role) {
      throw conflict("The batch has moved on; ask the next reviewer to send it back");
    }
    const mine = await tx.approval.findFirst({
      where: { batchId, step, officerId: ctx.user.id, cycle: batch.cycle, decision: "APPROVE" },
    });
    if (!mine) throw conflict("You have not approved this batch at this step");
    const already = await tx.approval.findFirst({
      where: { batchId, step, officerId: ctx.user.id, cycle: batch.cycle, decision: "WITHDRAW" },
    });
    if (already) return { batch, withdrawn: false };

    await tx.approval.create({
      data: { batchId, step, officerId: ctx.user.id, decision: "WITHDRAW", reason: text, cycle: batch.cycle },
    });
    await audit(tx, {
      actor: ctx.user, action: "REVIEW_WITHDRAW", entityType: "batch", entityId: batchId,
      fromState: batch.status, reason: text, requestId: ctx.requestId,
    });
    return { batch, withdrawn: true };
  });
}
