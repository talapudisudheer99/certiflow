import type { Batch, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import type { Person } from "../auth";
import { validateCandidates } from "../domain/csv";

type Ctx = { user: Person; requestId?: string };

/** Who can see a batch: its centre, officers of its district, quality and state (US-2). */
export function batchVisibilityFilter(user: Person): Prisma.BatchWhereInput {
  switch (user.role) {
    case "CENTRE":
      return { centreId: user.centreId ?? "__none__" };
    case "DISTRICT_OFFICER":
      return { centre: { districtId: user.districtId ?? "__none__" } };
    default:
      return {};
  }
}

/** Loads a batch the user may see. Another district's or centre's batch looks like "not found". */
export async function getVisibleBatch(user: Person, batchId: string) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, ...batchVisibilityFilter(user) } });
  if (!batch) throw notFound("Batch not found");
  return batch;
}

/** Row lock: concurrent requests on the same batch run one after another (see review.ts). */
export async function lockBatch(tx: Prisma.TransactionClient, batchId: string): Promise<Batch> {
  await tx.$queryRaw`SELECT id FROM "Batch" WHERE id = ${batchId} FOR UPDATE`;
  const batch = await tx.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound("Batch not found");
  return batch;
}

export async function createBatch(ctx: Ctx, input: { name: string; courseCode: string }) {
  if (ctx.user.role !== "CENTRE" || !ctx.user.centreId) throw forbidden("Only a training centre can create a batch");
  const centreId = ctx.user.centreId;
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: { name: input.name, courseCode: input.courseCode, centreId, createdById: ctx.user.id },
    });
    await audit(tx, { actor: ctx.user, action: "BATCH_CREATED", entityType: "batch", entityId: batch.id, toState: "DRAFT", requestId: ctx.requestId });
    return batch;
  });
}

/**
 * Moment 1: validate every row, report every error, save nothing unless the whole file is valid.
 * Uploading again replaces the batch's candidates (that is how a returned batch is fixed).
 */
export async function uploadCandidates(ctx: Ctx, batchId: string, csv: string) {
  const batch = await getVisibleBatch(ctx.user, batchId);
  if (ctx.user.role !== "CENTRE") throw forbidden("Only the training centre can upload candidates");
  if (batch.status !== "DRAFT" && batch.status !== "RETURNED") {
    throw conflict(`Candidates can only be changed while the batch is a draft or returned (it is ${batch.status})`);
  }

  const result = validateCandidates(csv, batch.courseCode);
  if (!result.ok) return { ok: false as const, errors: result.errors };

  // Decision D6: a person already certified for this course cannot be certified again.
  const already = await prisma.certificate.findMany({
    where: { courseCode: batch.courseCode, phone: { in: result.rows.map((r) => r.phone) } },
    select: { phone: true },
  });
  if (already.length > 0) {
    const taken = new Set(already.map((c) => c.phone));
    const errors = result.rows
      .map((r, i) => ({ r, row: i + 2 }))
      .filter(({ r }) => taken.has(r.phone))
      .map(({ row }) => ({ row, field: "phone", message: "this person already has a certificate for this course" }));
    return { ok: false as const, errors };
  }

  // One transaction: the old candidates are replaced by the new ones, or nothing changes.
  await prisma.$transaction(async (tx) => {
    const locked = await lockBatch(tx, batchId);
    if (locked.status !== "DRAFT" && locked.status !== "RETURNED") throw conflict("The batch was submitted meanwhile");
    await tx.candidate.deleteMany({ where: { batchId } });
    await tx.candidate.createMany({ data: result.rows.map((r) => ({ ...r, batchId })) });
    await audit(tx, {
      actor: ctx.user, action: "CANDIDATES_UPLOADED", entityType: "batch", entityId: batchId,
      reason: `${result.rows.length} candidates`, requestId: ctx.requestId,
    });
  });
  return { ok: true as const, count: result.rows.length };
}

/**
 * Centre sends the batch for approval. From RETURNED this starts a new cycle (decision D4):
 * approvals of the old cycle no longer count, but stay in the history.
 * Submitting twice (double click) is a no-op, not an error.
 */
export async function submitBatch(ctx: Ctx, batchId: string) {
  await getVisibleBatch(ctx.user, batchId);
  if (ctx.user.role !== "CENTRE") throw forbidden("Only the training centre can submit its batch");
  return prisma.$transaction(async (tx) => {
    const batch = await lockBatch(tx, batchId);
    if (batch.status === "DISTRICT_REVIEW") return { batch, changed: false };
    if (batch.status !== "DRAFT" && batch.status !== "RETURNED") {
      throw conflict(`A ${batch.status} batch cannot be submitted`);
    }
    const count = await tx.candidate.count({ where: { batchId } });
    if (count === 0) throw badRequest("Upload candidates before submitting");

    const updated = await tx.batch.update({
      where: { id: batchId },
      data: {
        status: "DISTRICT_REVIEW",
        version: { increment: 1 },
        cycle: batch.status === "RETURNED" ? { increment: 1 } : undefined,
        stepEnteredAt: new Date(),
        escalatedAt: null,
      },
    });
    await audit(tx, {
      actor: ctx.user, action: batch.status === "RETURNED" ? "BATCH_RESUBMITTED" : "BATCH_SUBMITTED",
      entityType: "batch", entityId: batchId, fromState: batch.status, toState: "DISTRICT_REVIEW",
      reason: `cycle ${updated.cycle}`, requestId: ctx.requestId,
    });
    return { batch: updated, changed: true };
  });
}
