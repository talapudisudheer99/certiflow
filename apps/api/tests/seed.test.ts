import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { seedDemo } from "../src/demo-data";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const FLOW_IDS = [
  "batch-flow-draft",
  "batch-flow-district",
  "batch-flow-quality",
  "batch-flow-state",
  "batch-flow-completed",
  "batch-flow-stuck",
  "batch-flow-returned",
];

async function totals() {
  const [batches, candidates, certificates, approvals, audits, deliveries] = await Promise.all([
    prisma.batch.count(),
    prisma.candidate.count(),
    prisma.certificate.count(),
    prisma.approval.count(),
    prisma.auditLog.count(),
    prisma.delivery.count(),
  ]);
  return { batches, candidates, certificates, approvals, audits, deliveries };
}

describe("sample data", () => {
  it("running the seed twice creates nothing new", async () => {
    for (const id of FLOW_IDS) {
      expect(await prisma.batch.findUnique({ where: { id } })).toBeTruthy();
    }
    expect(await prisma.certificate.count({ where: { batchId: "batch-flow-completed" } })).toBe(6);
    expect(await prisma.delivery.count({ where: { certificate: { batchId: "batch-flow-completed" }, status: "SENT" } })).toBe(6);
    const before = await totals();
    await seedDemo(prisma);
    expect(await totals()).toEqual(before);
  });
});
