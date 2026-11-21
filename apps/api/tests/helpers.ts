import { prisma } from "../src/db";
import { seedDemo } from "../src/demo-data";
import type { Person } from "../src/auth";
import { createBatch, submitBatch, uploadCandidates } from "../src/services/batches";
import { reviewBatch } from "../src/services/review";

export const QUALITY_MIN = 50;

export async function resetDb() {
  // TRUNCATE is used only by tests; the app itself can never delete audit rows (trigger).
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditLog", "OutboxEvent", "Delivery", "Certificate", "Approval", "Candidate", "Batch", "User", "Centre", "District" CASCADE`,
  );
  await seedDemo(prisma);
}

async function person(id: string): Promise<Person> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id: u.id, name: u.name, role: u.role, districtId: u.districtId, centreId: u.centreId };
}
export const people = {
  anika: () => person("user-anika"),
  dev: () => person("user-dev"),
  meera: () => person("user-meera"),
  kabir: () => person("user-kabir"),
  neha: () => person("user-neha"),
  farah: () => person("user-farah"),
};

let phoneCounter = 0;
/** Builds a valid CSV with `n` candidates and unique phone numbers. */
export function csvFor(n: number, course = "ELEC-101") {
  const lines = ["full_name,phone,date_of_birth,course_code,score"];
  for (let i = 0; i < n; i++) {
    phoneCounter++;
    lines.push(`Candidate ${i + 1} Test,9${String(100000000 + phoneCounter).slice(-9)},2001-05-10,${course},${60 + (i % 40)}`);
  }
  return lines.join("\n");
}

/** A batch with n candidates, already submitted to district review. */
export async function submittedBatch(n: number) {
  const anika = await people.anika();
  const batch = await createBatch({ user: anika }, { name: `Batch of ${n}`, courseCode: "ELEC-101" });
  const up = await uploadCandidates({ user: anika }, batch.id, csvFor(n));
  if (!up.ok) throw new Error(JSON.stringify(up.errors));
  await submitBatch({ user: anika }, batch.id);
  return batch.id;
}

export const approve = async (who: () => Promise<Person>, batchId: string) =>
  reviewBatch({ user: await who() }, batchId, { decision: "APPROVE" }, QUALITY_MIN);
