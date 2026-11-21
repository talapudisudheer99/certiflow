import type IORedis from "ioredis";
import { prisma } from "../db";
import { audit } from "../lib/audit";
import { badRequest, forbidden, notFound } from "../lib/http";
import { maskName } from "../lib/signing";
import type { Person } from "../auth";
import { publishBatchChange } from "../lib/events";

export const CERT_NUMBER = /^PSM-\d{4}-\d{6}$/;
const CACHE_TTL_SECONDS = 60;
const cacheKey = (number: string) => `verify:${number}`;

export type VerifyResult =
  | { status: "NOT_FOUND"; number: string }
  | { status: "VALID" | "CANCELLED"; number: string; holder: string; course: string; issuedOn: string; centre: string; cancelledOn?: string };

/** Never let a Redis problem break verification: on any cache error, fall back to the database. */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Public certificate check (US-9). Cache first, then the database. Shows only masked,
 * non-sensitive data: no phone, no date of birth.
 */
export async function verifyCertificate(number: string, redis: IORedis | null): Promise<VerifyResult> {
  if (!CERT_NUMBER.test(number)) throw badRequest("Certificate numbers look like PSM-2026-000123");

  const cached = redis ? await safe(() => redis.get(cacheKey(number))) : null;
  if (cached) return JSON.parse(cached) as VerifyResult;

  const cert = await prisma.certificate.findUnique({
    where: { number },
    include: { batch: { include: { centre: true } } },
  });
  const result: VerifyResult = cert
    ? {
        status: cert.status,
        number,
        holder: maskName(cert.holderName),
        course: cert.courseCode,
        issuedOn: cert.issuedAt.toISOString().slice(0, 10),
        centre: cert.batch.centre.name,
        cancelledOn: cert.cancelledAt?.toISOString().slice(0, 10),
      }
    : { status: "NOT_FOUND", number };

  if (redis) await safe(() => redis.set(cacheKey(number), JSON.stringify(result), "EX", CACHE_TTL_SECONDS));
  return result;
}

/**
 * State office cancels a certificate (moment 4). The record is kept (decision D8). The cache
 * entry is deleted right after the commit, and the cache TTL (60 s) is the safety net if Redis
 * was unreachable at that moment.
 */
export async function cancelCertificate(
  ctx: { user: Person; requestId?: string },
  certificateId: string,
  reason: string,
  redis: IORedis | null,
) {
  if (ctx.user.role !== "STATE") throw forbidden("Only the state office can cancel a certificate");
  if (!reason.trim()) throw badRequest("A reason is required to cancel a certificate");

  const cert = await prisma.$transaction(async (tx) => {
    const existing = await tx.certificate.findUnique({ where: { id: certificateId } });
    if (!existing) throw notFound("Certificate not found");
    if (existing.status === "CANCELLED") return existing; // cancel twice: no change
    const updated = await tx.certificate.update({
      where: { id: certificateId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim(), cancelledById: ctx.user.id },
    });
    await audit(tx, {
      actor: ctx.user, action: "CERTIFICATE_CANCELLED", entityType: "certificate", entityId: certificateId,
      fromState: "VALID", toState: "CANCELLED", reason: reason.trim(), requestId: ctx.requestId,
    });
    return updated;
  });

  if (redis) await safe(() => redis.del(cacheKey(cert.number)));
  if (cert.status === "CANCELLED") void publishBatchChange("certificate.cancelled", cert.batchId);
  return cert;
}
