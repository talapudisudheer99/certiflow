import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { route, badRequest } from "../lib/http";
import { requireUser, type UserStore } from "../auth";
import { batchVisibilityFilter, createBatch, getVisibleBatch, submitBatch, uploadCandidates } from "../services/batches";
import { reviewBatch } from "../services/review";
import { ROLE_FOR_STEP } from "../domain/workflow";
import type { BatchStatus } from "@prisma/client";

const createSchema = z.object({
  name: z.string().trim().min(3, "Batch name needs at least 3 characters").max(100),
  courseCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Course code: 2-20 letters, digits or -"),
});
const uploadSchema = z.object({ csv: z.string().min(1, "The file is empty").max(2_000_000, "File too large") });
const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SEND_BACK"]),
  reason: z.string().trim().max(500).optional(),
});

const STATUS_FOR_ROLE: Partial<Record<string, BatchStatus>> = {
  DISTRICT_OFFICER: "DISTRICT_REVIEW",
  QUALITY: "QUALITY_REVIEW",
  STATE: "STATE_REVIEW",
};

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw badRequest(r.error.issues[0]?.message ?? "Invalid input", r.error.issues);
  return r.data;
}

export function batchesRouter(users: UserStore, opts: { qualityMinSize: number }) {
  const router = Router();
  router.use(requireUser(users));

  // ?waiting=1 -> only batches waiting for the current person's step (their review queue).
  router.get("/", route(async (req, res) => {
    const user = req.user!;
    const waitingStatus = req.query.waiting === "1" ? STATUS_FOR_ROLE[user.role] : undefined;
    const batches = await prisma.batch.findMany({
      where: { ...batchVisibilityFilter(user), ...(waitingStatus ? { status: waitingStatus } : {}) },
      orderBy: { updatedAt: "desc" },
      include: { centre: { select: { name: true } }, _count: { select: { candidates: true, certificates: true } } },
      take: 200,
    });
    res.json({ batches });
  }));

  router.post("/", route(async (req, res) => {
    const input = parse(createSchema, req.body);
    const batch = await createBatch({ user: req.user!, requestId: res.locals.requestId }, input);
    res.status(201).json({ batch });
  }));

  router.get("/:id", route(async (req, res) => {
    const user = req.user!;
    const batch = await getVisibleBatch(user, req.params.id);
    const [candidates, approvals, certificates, history, centre] = await Promise.all([
      prisma.candidate.findMany({ where: { batchId: batch.id }, orderBy: { createdAt: "asc" } }),
      prisma.approval.findMany({ where: { batchId: batch.id }, include: { officer: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.certificate.findMany({ where: { batchId: batch.id }, include: { delivery: true }, orderBy: { number: "asc" } }),
      prisma.auditLog.findMany({ where: { entityType: "batch", entityId: batch.id }, orderBy: { createdAt: "asc" } }),
      prisma.centre.findUnique({ where: { id: batch.centreId } }),
    ]);
    res.json({ batch: { ...batch, centreName: centre?.name }, candidates, approvals, certificates, history, myStepRole: ROLE_FOR_STEP });
  }));

  router.post("/:id/candidates", route(async (req, res) => {
    const { csv } = parse(uploadSchema, req.body);
    const result = await uploadCandidates({ user: req.user!, requestId: res.locals.requestId }, req.params.id, csv);
    if (!result.ok) return res.status(422).json({ error: "Nothing was saved. Fix these rows and upload again.", errors: result.errors });
    res.json({ count: result.count });
  }));

  router.post("/:id/submit", route(async (req, res) => {
    const r = await submitBatch({ user: req.user!, requestId: res.locals.requestId }, req.params.id);
    res.json(r);
  }));

  router.post("/:id/review", route(async (req, res) => {
    const input = parse(reviewSchema, req.body);
    const r = await reviewBatch({ user: req.user!, requestId: res.locals.requestId }, req.params.id, input, opts.qualityMinSize);
    res.json(r);
  }));

  return router;
}
