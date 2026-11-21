import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "./logger";
import { issueCertificates } from "./services/certificates";

/** Fixed ids make seeding idempotent: running it twice changes nothing (US-1). */
export const DEMO_PEOPLE = [
  { id: "user-anika", name: "Anika", role: "CENTRE", centreId: "centre-hyd", districtId: "district-north" },
  { id: "user-dev", name: "Dev", role: "DISTRICT_OFFICER", districtId: "district-north" },
  { id: "user-meera", name: "Meera", role: "DISTRICT_OFFICER", districtId: "district-north" },
  { id: "user-kabir", name: "Kabir", role: "DISTRICT_OFFICER", districtId: "district-north" },
  { id: "user-neha", name: "Neha", role: "QUALITY" },
  { id: "user-farah", name: "Farah", role: "STATE" },
] as const;

export async function seedDemo(prisma: PrismaClient) {
  await prisma.district.upsert({ where: { id: "district-north" }, update: {}, create: { id: "district-north", name: "North District" } });
  await prisma.district.upsert({ where: { id: "district-south" }, update: {}, create: { id: "district-south", name: "South District" } });
  await prisma.centre.upsert({
    where: { id: "centre-hyd" },
    update: {},
    create: { id: "centre-hyd", name: "Pragati Skills Centre, Hyderabad", districtId: "district-north" },
  });
  for (const p of DEMO_PEOPLE) {
    await prisma.user.upsert({ where: { id: p.id }, update: {}, create: { ...p } });
  }

  // One small sample batch already waiting for the district officers.
  const sampleId = "batch-sample-electrician";
  const exists = await prisma.batch.findUnique({ where: { id: sampleId } });
  if (!exists) {
    await prisma.batch.create({
      data: {
        id: sampleId, name: "Electrician - October (sample)", courseCode: "ELEC-101", centreId: "centre-hyd",
        createdById: "user-anika", status: "DISTRICT_REVIEW",
        candidates: {
          create: [
            { fullName: "Ravi Kumar", phone: "9876500001", dateOfBirth: new Date("2001-04-12"), courseCode: "ELEC-101", score: 78 },
            { fullName: "Sita Devi", phone: "9876500002", dateOfBirth: new Date("2000-09-30"), courseCode: "ELEC-101", score: 85 },
            { fullName: "Arjun Reddy", phone: "9876500003", dateOfBirth: new Date("2002-01-05"), courseCode: "ELEC-101", score: 66 },
          ],
        },
      },
    });
    await prisma.auditLog.create({
      data: { actorId: "user-anika", actorName: "Anika", action: "BATCH_SUBMITTED", entityType: "batch", entityId: sampleId, fromState: "DRAFT", toState: "DISTRICT_REVIEW", reason: "seed" },
    });
  }

  await seedFlows(prisma);
  const ready = await prisma.certificate.findMany({ where: { batchId: COMPLETED_ID }, orderBy: { number: "asc" }, select: { number: true } });
  logger.info({ numbers: ready.map((c) => c.number) }, "Sample certificates ready to verify");
}

const COURSE = "ELEC-101";
const CENTRE = "centre-hyd";
const DRAFT_ID = "batch-flow-draft";
const DISTRICT_ID = "batch-flow-district";
const QUALITY_ID = "batch-flow-quality";
const STATE_ID = "batch-flow-state";
const COMPLETED_ID = "batch-flow-completed";
const STUCK_ID = "batch-flow-stuck";
const RETURNED_ID = "batch-flow-returned";

const anika = { id: "user-anika", name: "Anika" };
const dev = { id: "user-dev", name: "Dev" };
const meera = { id: "user-meera", name: "Meera" };
const farah = { id: "user-farah", name: "Farah" };

/** 10-digit phones in a range the tests do not use. */
function learners(base: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    fullName: `Learner ${base + i}`,
    phone: String(base + i),
    dateOfBirth: new Date("2001-06-15"),
    courseCode: COURSE,
    score: 70 + (i % 31),
  }));
}

function trail(entityId: string, rows: { action: string; from?: string; to?: string; who?: { id: string; name: string }; reason?: string }[]): Prisma.AuditLogCreateManyInput[] {
  return rows.map((r) => ({
    actorId: r.who?.id ?? null,
    actorName: r.who?.name ?? "system",
    action: r.action,
    entityType: "batch",
    entityId,
    fromState: r.from ?? null,
    toState: r.to ?? null,
    reason: r.reason ?? null,
  }));
}

/** Seven fixed batches so every role has something to try. Skips any batch that already exists. */
async function seedFlows(prisma: PrismaClient) {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

  if (!(await prisma.batch.findUnique({ where: { id: DRAFT_ID } }))) {
    await prisma.batch.create({
      data: { id: DRAFT_ID, name: "Draft: ready to submit", courseCode: COURSE, centreId: CENTRE, createdById: anika.id, status: "DRAFT", candidates: { create: learners(9700001101, 5) } },
    });
    await prisma.auditLog.createMany({ data: trail(DRAFT_ID, [{ action: "BATCH_CREATED", to: "DRAFT", who: anika }]) });
  }

  if (!(await prisma.batch.findUnique({ where: { id: DISTRICT_ID } }))) {
    await prisma.batch.create({
      data: {
        id: DISTRICT_ID, name: "District: waiting for a second officer", courseCode: COURSE, centreId: CENTRE, createdById: anika.id, status: "DISTRICT_REVIEW",
        candidates: { create: learners(9700002101, 5) },
        approvals: { create: { step: "DISTRICT", officerId: dev.id, decision: "APPROVE", cycle: 1, reason: "Looks complete" } },
      },
    });
    await prisma.auditLog.createMany({ data: trail(DISTRICT_ID, [
      { action: "BATCH_CREATED", to: "DRAFT", who: anika },
      { action: "BATCH_SUBMITTED", from: "DRAFT", to: "DISTRICT_REVIEW", who: anika, reason: "cycle 1" },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: dev, reason: "DISTRICT approval" },
    ]) });
  }

  if (!(await prisma.batch.findUnique({ where: { id: QUALITY_ID } }))) {
    await prisma.batch.create({
      data: {
        id: QUALITY_ID, name: "Quality: Neha's turn", courseCode: COURSE, centreId: CENTRE, createdById: anika.id, status: "QUALITY_REVIEW",
        candidates: { create: learners(9700003101, 55) },
        approvals: { create: [
          { step: "DISTRICT", officerId: dev.id, decision: "APPROVE", cycle: 1 },
          { step: "DISTRICT", officerId: meera.id, decision: "APPROVE", cycle: 1 },
        ] },
      },
    });
    await prisma.auditLog.createMany({ data: trail(QUALITY_ID, [
      { action: "BATCH_CREATED", to: "DRAFT", who: anika },
      { action: "BATCH_SUBMITTED", from: "DRAFT", to: "DISTRICT_REVIEW", who: anika, reason: "cycle 1" },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: dev },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: meera },
      { action: "BATCH_MOVED", from: "DISTRICT_REVIEW", to: "QUALITY_REVIEW", who: meera, reason: "55 candidates" },
    ]) });
  }

  if (!(await prisma.batch.findUnique({ where: { id: STATE_ID } }))) {
    await prisma.batch.create({
      data: {
        id: STATE_ID, name: "State: Farah's turn", courseCode: COURSE, centreId: CENTRE, createdById: anika.id, status: "STATE_REVIEW",
        candidates: { create: learners(9700004101, 8) },
        approvals: { create: [
          { step: "DISTRICT", officerId: dev.id, decision: "APPROVE", cycle: 1 },
          { step: "DISTRICT", officerId: meera.id, decision: "APPROVE", cycle: 1 },
        ] },
      },
    });
    await prisma.auditLog.createMany({ data: trail(STATE_ID, [
      { action: "BATCH_CREATED", to: "DRAFT", who: anika },
      { action: "BATCH_SUBMITTED", from: "DRAFT", to: "DISTRICT_REVIEW", who: anika, reason: "cycle 1" },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: dev },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: meera },
      { action: "BATCH_MOVED", from: "DISTRICT_REVIEW", to: "STATE_REVIEW", who: meera, reason: "8 candidates, no quality step" },
    ]) });
  }

  if (!(await prisma.batch.findUnique({ where: { id: COMPLETED_ID } }))) {
    await prisma.batch.create({
      data: {
        id: COMPLETED_ID, name: "Completed: certificates ready to check", courseCode: COURSE, centreId: CENTRE, createdById: anika.id, status: "APPROVED",
        candidates: { create: learners(9700005101, 6) },
        approvals: { create: [
          { step: "DISTRICT", officerId: dev.id, decision: "APPROVE", cycle: 1 },
          { step: "DISTRICT", officerId: meera.id, decision: "APPROVE", cycle: 1 },
          { step: "STATE", officerId: farah.id, decision: "APPROVE", cycle: 1 },
        ] },
      },
    });
    await prisma.auditLog.createMany({ data: trail(COMPLETED_ID, [
      { action: "BATCH_CREATED", to: "DRAFT", who: anika },
      { action: "BATCH_SUBMITTED", from: "DRAFT", to: "DISTRICT_REVIEW", who: anika, reason: "cycle 1" },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: dev },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: meera },
      { action: "BATCH_MOVED", from: "DISTRICT_REVIEW", to: "STATE_REVIEW", who: meera },
      { action: "REVIEW_APPROVE", from: "STATE_REVIEW", who: farah },
      { action: "BATCH_MOVED", from: "STATE_REVIEW", to: "APPROVED", who: farah },
    ]) });
    await issueCertificates(COMPLETED_ID, {
      hmacSecret: process.env.CERT_HMAC_SECRET || "seed-hmac-seed-hmac-seed-hmac-seed",
      storageDir: process.env.STORAGE_DIR || "storage",
      publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8080",
    });
    await prisma.delivery.updateMany({ where: { certificate: { batchId: COMPLETED_ID } }, data: { status: "SENT", providerMessageId: "seed" } });
  }

  if (!(await prisma.batch.findUnique({ where: { id: STUCK_ID } }))) {
    const entered = daysAgo(3);
    await prisma.batch.create({
      data: {
        id: STUCK_ID, name: "Stuck: waiting too long", courseCode: COURSE, centreId: CENTRE, createdById: anika.id, status: "DISTRICT_REVIEW",
        stepEnteredAt: entered, escalatedAt: daysAgo(1),
        candidates: { create: learners(9700006101, 4) },
      },
    });
    await prisma.auditLog.createMany({ data: trail(STUCK_ID, [
      { action: "BATCH_CREATED", to: "DRAFT", who: anika },
      { action: "BATCH_SUBMITTED", from: "DRAFT", to: "DISTRICT_REVIEW", who: anika, reason: "cycle 1" },
      { action: "BATCH_ESCALATED", from: "DISTRICT_REVIEW", reason: "Waiting at district step longer than the limit" },
    ]) });
  }

  if (!(await prisma.batch.findUnique({ where: { id: RETURNED_ID } }))) {
    await prisma.batch.create({
      data: {
        id: RETURNED_ID, name: "Sent back: fix and resend", courseCode: COURSE, centreId: CENTRE, createdById: anika.id,
        status: "RETURNED", cycle: 1, returnReason: "The date of birth on row 2 is wrong",
        candidates: { create: learners(9700007101, 5) },
        approvals: { create: { step: "DISTRICT", officerId: dev.id, decision: "APPROVE", cycle: 1, reason: "Approved before it was sent back" } },
      },
    });
    await prisma.auditLog.createMany({ data: trail(RETURNED_ID, [
      { action: "BATCH_CREATED", to: "DRAFT", who: anika },
      { action: "BATCH_SUBMITTED", from: "DRAFT", to: "DISTRICT_REVIEW", who: anika, reason: "cycle 1" },
      { action: "REVIEW_APPROVE", from: "DISTRICT_REVIEW", who: dev },
      { action: "BATCH_MOVED", from: "DISTRICT_REVIEW", to: "RETURNED", who: meera, reason: "The date of birth on row 2 is wrong" },
    ]) });
  }
}
