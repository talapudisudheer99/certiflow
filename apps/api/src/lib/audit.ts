import type { Prisma } from "@prisma/client";

export type Actor = { id: string; name: string } | null;

export type AuditEntry = {
  actor: Actor;
  action: string;
  entityType: "batch" | "certificate" | "delivery" | "request";
  entityId: string;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  requestId?: string | null;
};

/**
 * Append-only audit record (US-10). Always written inside the same transaction as the change,
 * so a decision and its record are saved together or not at all.
 * A database trigger rejects UPDATE and DELETE on AuditLog.
 */
export function audit(tx: Prisma.TransactionClient, e: AuditEntry) {
  return tx.auditLog.create({
    data: {
      actorId: e.actor?.id ?? null,
      actorName: e.actor?.name ?? "system",
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      fromState: e.fromState ?? null,
      toState: e.toState ?? null,
      reason: e.reason ?? null,
      requestId: e.requestId ?? null,
    },
  });
}
