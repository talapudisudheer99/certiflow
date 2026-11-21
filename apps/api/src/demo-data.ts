import type { PrismaClient } from "@prisma/client";

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
}
