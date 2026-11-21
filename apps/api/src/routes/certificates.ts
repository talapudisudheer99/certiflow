import fs from "node:fs/promises";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type IORedis from "ioredis";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { badRequest, forbidden, notFound, route } from "../lib/http";
import { verifyDownload } from "../lib/signing";
import { requireRole, requireUser, type UserStore } from "../auth";
import { getVisibleBatch } from "../services/batches";
import { cancelCertificate, verifyCertificate } from "../services/verify";
import { certificatePdf } from "../services/certificates";

export type CertDeps = { users: UserStore; redis: IORedis | null; hmacSecret: string; publicBaseUrl: string };

/** Public routes: no login (US-9, US-14). Rate limited so numbers cannot be guessed in bulk. */
export function publicRouter(deps: CertDeps) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many checks, please wait a minute" } });

  router.get("/verify/:number", limiter, route(async (req, res) => {
    res.json(await verifyCertificate(req.params.number.trim().toUpperCase(), deps.redis));
  }));

  // Signed, expiring link sent on WhatsApp. Without a valid signature: 403.
  router.get("/certificates/:id/pdf", limiter, route(async (req, res) => {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig ?? "");
    if (!verifyDownload(deps.hmacSecret, req.params.id, exp, sig)) throw forbidden("This download link is invalid or has expired");
    const cert = await prisma.certificate.findUnique({ where: { id: req.params.id }, include: { batch: { include: { centre: true } } } });
    if (!cert) throw notFound("Certificate not found");
    if (cert.status === "CANCELLED") throw forbidden("This certificate has been cancelled");
    // Serve the worker's file if this container can see it, otherwise rebuild it from the database.
    const file = cert.pdfPath ? await fs.readFile(cert.pdfPath).catch(() => null) : null;
    const pdf = file ?? certificatePdf(cert, cert.batch.centre.name, `${deps.publicBaseUrl}/verify/${cert.number}`);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${cert.number}.pdf"`);
    res.send(pdf);
  }));

  return router;
}

/** State office tools: cancel, resend failed WhatsApp, stuck list (US-6, US-8, US-11). */
export function stateRouter(deps: CertDeps) {
  const router = Router();
  router.use(requireUser(deps.users), requireRole("STATE"));

  router.post("/certificates/:id/cancel", route(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500) }).parse(req.body ?? {});
    const cert = await cancelCertificate({ user: req.user!, requestId: res.locals.requestId }, req.params.id, reason, deps.redis);
    res.json({ certificate: { id: cert.id, number: cert.number, status: cert.status } });
  }));

  router.post("/certificates/:id/resend", route(async (req, res) => {
    const id = req.params.id;
    const done = await prisma.$transaction(async (tx) => {
      const r = await tx.delivery.updateMany({ where: { certificateId: id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, lastError: null } });
      if (r.count === 0) return false;
      await tx.outboxEvent.create({ data: { type: "delivery.resend", payload: { certificateId: id } } });
      await audit(tx, { actor: req.user!, action: "WHATSAPP_RESEND", entityType: "certificate", entityId: id, fromState: "FAILED", toState: "PENDING", requestId: res.locals.requestId });
      return true;
    });
    if (!done) throw badRequest("Only a failed delivery can be resent");
    res.json({ ok: true });
  }));

  router.get("/stuck", route(async (_req, res) => {
    const batches = await prisma.batch.findMany({
      where: { escalatedAt: { not: null }, status: { in: ["DISTRICT_REVIEW", "QUALITY_REVIEW", "STATE_REVIEW"] } },
      include: { centre: { select: { name: true } } },
      orderBy: { stepEnteredAt: "asc" },
    });
    res.json({ batches });
  }));

  router.get("/deliveries/failed", route(async (_req, res) => {
    const deliveries = await prisma.delivery.findMany({
      where: { status: "FAILED" },
      include: { certificate: { select: { id: true, number: true, holderName: true, batchId: true } } },
    });
    res.json({ deliveries });
  }));

  return router;
}

/** Certificate history for anyone who can see the batch, not only the state office. */
export function certificateHistoryRouter(deps: CertDeps) {
  const router = Router();
  router.use(requireUser(deps.users));
  router.get("/certificates/:id/history", route(async (req, res) => {
    const cert = await prisma.certificate.findUnique({ where: { id: req.params.id } });
    if (!cert) throw notFound("Certificate not found");
    await getVisibleBatch(req.user!, cert.batchId);
    const history = await prisma.auditLog.findMany({
      where: { entityType: "certificate", entityId: cert.id },
      orderBy: { createdAt: "asc" },
    });
    res.json({ history });
  }));
  return router;
}
