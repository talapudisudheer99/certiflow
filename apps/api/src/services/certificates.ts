import fs from "node:fs/promises";
import path from "node:path";
import type { Certificate } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { buildPdf } from "../lib/pdf";
import { hmac, signDownload } from "../lib/signing";

export type IssueConfig = { hmacSecret: string; storageDir: string; publicBaseUrl: string };

/**
 * Issues exactly one certificate per candidate of an approved batch (US-7, moment 3).
 *
 * Safe to run any number of times, by any number of workers at once:
 *  - one worker at a time works on a batch (two at once used to deadlock),
 *  - INSERT ... SELECT only picks candidates that have no certificate yet,
 *  - ON CONFLICT DO NOTHING plus UNIQUE(candidateId) and UNIQUE(phone, courseCode) stop a
 *    second certificate even if two workers race,
 *  - numbers come from a Postgres sequence, so two certificates can never share a number.
 * Returns the ids of certificates that still need delivery.
 */
export async function issueCertificates(batchId: string, cfg: IssueConfig): Promise<string[]> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || !["APPROVED", "ISSUING", "COMPLETED"].includes(batch.status)) return [];

  // A 5,000-row batch can take longer than Prisma's 5-second default.
  await prisma.$transaction(async (tx) => {
    // Wait until any other worker finishes this batch. Inserting the same people
    // at the same time, in different orders, deadlocks on the unique indexes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cert-issue:${batchId}`}, 0))`;

    const started = await tx.batch.updateMany({ where: { id: batchId, status: "APPROVED" }, data: { status: "ISSUING" } });
    if (started.count === 1) {
      await audit(tx, { actor: null, action: "ISSUING_STARTED", entityType: "batch", entityId: batchId, fromState: "APPROVED", toState: "ISSUING" });
    }

    await tx.$executeRaw`
      INSERT INTO "Certificate" ("id", "number", "candidateId", "batchId", "holderName", "phone", "courseCode", "status", "issuedAt")
      SELECT gen_random_uuid()::text,
             'PSM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('certificate_number_seq')::text, 6, '0'),
             c."id", c."batchId", c."fullName", c."phone", c."courseCode", 'VALID', now()
      FROM "Candidate" c
      WHERE c."batchId" = ${batchId}
        AND NOT EXISTS (SELECT 1 FROM "Certificate" x WHERE x."candidateId" = c."id")
      ORDER BY c."id"
      ON CONFLICT DO NOTHING`;

    const unhashed = await tx.certificate.findMany({ where: { batchId, hash: null }, orderBy: { id: "asc" } });
    for (const c of unhashed) {
      await tx.certificate.update({
        where: { id: c.id },
        data: { hash: hmac(cfg.hmacSecret, `${c.number}|${c.holderName}|${c.courseCode}`) },
      });
    }

    await tx.$executeRaw`
      INSERT INTO "Delivery" ("id", "certificateId", "status", "attempts", "updatedAt")
      SELECT gen_random_uuid()::text, x."id", 'PENDING', 0, now()
      FROM "Certificate" x WHERE x."batchId" = ${batchId}
      ORDER BY x."id"
      ON CONFLICT ("certificateId") DO NOTHING`;
  }, { timeout: 60_000 });

  const [candidates, certificates] = await Promise.all([
    prisma.candidate.count({ where: { batchId } }),
    prisma.certificate.count({ where: { batchId } }),
  ]);
  if (candidates === certificates) {
    await prisma.$transaction(async (tx) => {
      const done = await tx.batch.updateMany({ where: { id: batchId, status: "ISSUING" }, data: { status: "COMPLETED" } });
      if (done.count === 1) {
        await audit(tx, {
          actor: null, action: "BATCH_COMPLETED", entityType: "batch", entityId: batchId,
          fromState: "ISSUING", toState: "COMPLETED", reason: `${certificates} certificates issued`,
        });
      }
    });
  }

  const pending = await prisma.delivery.findMany({
    where: { certificate: { batchId }, status: "PENDING" },
    select: { certificateId: true },
  });
  return pending.map((d) => d.certificateId);
}

export function certificatePdf(cert: Certificate, centreName: string, verifyUrl: string) {
  return buildPdf([
    { text: "Pragati Skills Mission", size: 26, y: 740 },
    { text: "Certificate of Completion", size: 18, y: 705 },
    { text: "This certifies that", size: 12, y: 640 },
    { text: cert.holderName, size: 24, y: 605 },
    { text: `has completed the course ${cert.courseCode}`, size: 12, y: 570 },
    { text: `at ${centreName}`, size: 12, y: 550 },
    { text: `Certificate number: ${cert.number}`, size: 12, y: 480 },
    { text: `Issued: ${cert.issuedAt.toISOString().slice(0, 10)}`, size: 12, y: 460 },
    { text: `Verify: ${verifyUrl}`, size: 10, y: 420 },
  ]);
}

export async function ensurePdf(cert: Certificate, cfg: IssueConfig) {
  if (cert.pdfPath) return cert.pdfPath;
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: cert.batchId }, include: { centre: true } });
  const file = path.join(cfg.storageDir, `${cert.id}.pdf`);
  await fs.mkdir(cfg.storageDir, { recursive: true });
  await fs.writeFile(file, certificatePdf(cert, batch.centre.name, `${cfg.publicBaseUrl}/verify/${cert.number}`));
  await prisma.certificate.update({ where: { id: cert.id }, data: { pdfPath: file } });
  return file;
}

export type SendMessage = (msg: { to: string; text: string; idempotencyKey: string }) => Promise<{ id: string }>;

/**
 * Sends one certificate on WhatsApp (US-8). Called by a queue job that BullMQ retries with
 * exponential backoff. The idempotency key is the certificate id, so a retry after a timeout
 * (where the provider did deliver) never produces a second message.
 * Throws on failure so the queue retries.
 */
export async function deliverCertificate(certificateId: string, cfg: IssueConfig, send: SendMessage) {
  const delivery = await prisma.delivery.findUnique({ where: { certificateId }, include: { certificate: true } });
  if (!delivery || delivery.status === "SENT") return "skipped";
  const cert = delivery.certificate;
  if (cert.status === "CANCELLED") return "skipped";

  await ensurePdf(cert, cfg);
  await prisma.delivery.update({ where: { certificateId }, data: { attempts: { increment: 1 } } });

  const { exp, sig } = signDownload(cfg.hmacSecret, cert.id);
  const link = `${cfg.publicBaseUrl}/api/certificates/${cert.id}/pdf?exp=${exp}&sig=${sig}`;
  try {
    const res = await send({
      to: cert.phone,
      text: `Congratulations ${cert.holderName}! Your certificate ${cert.number} is ready: ${link}`,
      idempotencyKey: cert.id,
    });
    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { certificateId },
        data: { status: "SENT", providerMessageId: res.id, lastError: null },
      });
      await audit(tx, { actor: null, action: "WHATSAPP_SENT", entityType: "certificate", entityId: cert.id, toState: "SENT" });
    });
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.delivery.update({ where: { certificateId }, data: { lastError: message.slice(0, 300) } });
    throw err;
  }
}

/** Called when the queue gives up after the last retry: the state office sees it as FAILED. */
export async function markDeliveryFailed(certificateId: string, error: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.delivery.updateMany({
      where: { certificateId, status: "PENDING" },
      data: { status: "FAILED", lastError: error.slice(0, 300) },
    });
    if (r.count === 1) {
      await audit(tx, { actor: null, action: "WHATSAPP_FAILED", entityType: "certificate", entityId: certificateId, toState: "FAILED", reason: error.slice(0, 200) });
    }
  });
}

/** HTTP client for the WhatsApp stand-in, with a timeout shorter than the provider's hang. */
export function httpSender(baseUrl: string, timeoutMs = 5000): SendMessage {
  return async (msg) => {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`provider returned ${res.status}`);
    return (await res.json()) as { id: string };
  };
}
