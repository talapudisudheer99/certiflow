import type IORedis from "ioredis";
import { prisma } from "../db";

export const EVENTS_CHANNEL = "certiflow:events";

export type BatchEvent = { type: string; batchId: string; centreId: string; districtId: string };
export type EventViewer = { role: string; centreId?: string | null; districtId?: string | null };

let publisher: IORedis | null = null;

/** Called once at startup. Tests leave this unset, so publishing is a no-op. */
export function bindEventRedis(redis: IORedis | null) {
  publisher = redis;
}

/** Centre sees its own batches, a district officer sees their district, quality and state see all. */
export function canSeeEvent(user: EventViewer, event: BatchEvent): boolean {
  if (user.role === "CENTRE") return !!user.centreId && user.centreId === event.centreId;
  if (user.role === "DISTRICT_OFFICER") return !!user.districtId && user.districtId === event.districtId;
  return user.role === "QUALITY" || user.role === "STATE";
}

/** Tell open screens that a batch changed. Never throws: a missed refresh is not a failed action. */
export async function publishBatchChange(type: string, batchId: string) {
  if (!publisher) return;
  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { centreId: true, centre: { select: { districtId: true } } },
    });
    if (!batch) return;
    const event: BatchEvent = { type, batchId, centreId: batch.centreId, districtId: batch.centre.districtId };
    await publisher.publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch {
    /* live updates are best-effort */
  }
}
