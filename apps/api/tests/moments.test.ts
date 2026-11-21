import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { createCacheRedis } from "../src/redis";
import { HttpError } from "../src/lib/http";
import { createBatch, submitBatch, uploadCandidates } from "../src/services/batches";
import { reviewBatch } from "../src/services/review";
import { deliverCertificate, issueCertificates, type SendMessage } from "../src/services/certificates";
import { cancelCertificate, verifyCertificate } from "../src/services/verify";
import { escalateStuckBatches } from "../src/services/escalation";
import { QUALITY_MIN, approve, csvFor, people, resetDb, submittedBatch } from "./helpers";

const redis = createCacheRedis(process.env.REDIS_URL!);
const issueCfg = { hmacSecret: process.env.CERT_HMAC_SECRET!, storageDir: "storage-test", publicBaseUrl: "http://localhost:8080" };

beforeEach(resetDb);
afterAll(async () => {
  redis.disconnect();
  await prisma.$disconnect();
});

const statusOf = async (id: string) => (await prisma.batch.findUniqueOrThrow({ where: { id } })).status;
const expectHttp = async (p: Promise<unknown>, status: number) => {
  await expect(p).rejects.toBeInstanceOf(HttpError);
  await p.catch((e: HttpError) => expect(e.status).toBe(status));
};

describe("Moment 1: a spreadsheet with bad rows saves nothing", () => {
  it("returns every error and leaves the batch empty", async () => {
    const anika = await people.anika();
    const batch = await createBatch({ user: anika }, { name: "Bad file", courseCode: "ELEC-101" });
    const bad = csvFor(10).split("\n");
    bad[3] = "Row Four,12345,2001-01-01,ELEC-101,70"; // spreadsheet row 4: a bad phone number
    bad.push("No Score,9000000001,2001-01-01,ELEC-101,abc");
    const r = await uploadCandidates({ user: anika }, batch.id, bad.join("\n"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBe(2);
    expect(await prisma.candidate.count({ where: { batchId: batch.id } })).toBe(0);
  });

  it("a bad re-upload keeps the previous good candidates untouched", async () => {
    const anika = await people.anika();
    const batch = await createBatch({ user: anika }, { name: "Fix later", courseCode: "ELEC-101" });
    await uploadCandidates({ user: anika }, batch.id, csvFor(5));
    await uploadCandidates({ user: anika }, batch.id, "full_name,phone,date_of_birth,course_code,score\nX,1,2,3,4");
    expect(await prisma.candidate.count({ where: { batchId: batch.id } })).toBe(5);
  });
});

describe("Moment 2: two officers approve at the same moment", () => {
  it("the batch moves forward exactly once", async () => {
    const id = await submittedBatch(3);
    const results = await Promise.allSettled([approve(people.dev, id), approve(people.meera, id)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await statusOf(id)).toBe("STATE_REVIEW"); // 3 < 50, so no quality step
    const moves = await prisma.auditLog.count({ where: { entityId: id, action: "BATCH_MOVED" } });
    expect(moves).toBe(1);
  });

  it("three officers at once: still one move, the late one is told it moved on", async () => {
    const id = await submittedBatch(3);
    const results = await Promise.allSettled([approve(people.dev, id), approve(people.meera, id), approve(people.kabir, id)]);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "BATCH_MOVED" } })).toBe(1);
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    refused.forEach((r) => expect((r.reason as HttpError).status).toBe(409));
  });

  it("the same officer approving twice counts once (decision D2)", async () => {
    const id = await submittedBatch(3);
    await Promise.all([approve(people.dev, id), approve(people.dev, id)]);
    expect(await statusOf(id)).toBe("DISTRICT_REVIEW");
    expect(await prisma.approval.count({ where: { batchId: id } })).toBe(1);
  });
});

describe("Never: acting at a step that is not yours", () => {
  it("a centre cannot approve its own batch (403)", async () => {
    const id = await submittedBatch(3);
    await expectHttp(reviewBatch({ user: await people.anika() }, id, { decision: "APPROVE" }, QUALITY_MIN), 403);
  });

  it("an officer of another district cannot even see the batch (404)", async () => {
    await prisma.user.create({ data: { id: "user-south", name: "Sam", role: "DISTRICT_OFFICER", districtId: "district-south" } });
    const id = await submittedBatch(3);
    const sam = { id: "user-south", name: "Sam", role: "DISTRICT_OFFICER" as const, districtId: "district-south" };
    await expectHttp(reviewBatch({ user: sam }, id, { decision: "APPROVE" }, QUALITY_MIN), 404);
  });

  it("the state office cannot act at the district step (409)", async () => {
    const id = await submittedBatch(3);
    await expectHttp(approve(people.farah, id), 409);
  });

  it("reject and send back need a reason (400)", async () => {
    const id = await submittedBatch(3);
    await expectHttp(reviewBatch({ user: await people.dev() }, id, { decision: "REJECT" }, QUALITY_MIN), 400);
  });
});

describe("Moment 3: 60 candidates, exactly one certificate each, flaky WhatsApp", () => {
  it("issues 60 certificates once and delivers 60 messages once", async () => {
    const id = await submittedBatch(60);
    await approve(people.dev, id);
    await approve(people.meera, id);
    expect(await statusOf(id)).toBe("QUALITY_REVIEW"); // 60 >= 50 (decision D1)
    await approve(people.neha, id);
    await approve(people.farah, id);
    expect(await statusOf(id)).toBe("APPROVED");
    expect(await prisma.outboxEvent.count({ where: { type: "batch.approved" } })).toBe(1);

    // Two workers pick up the same event at the same time, then it is retried once more.
    await Promise.all([issueCertificates(id, issueCfg), issueCertificates(id, issueCfg)]);
    const pending = await issueCertificates(id, issueCfg);

    const certs = await prisma.certificate.findMany({ where: { batchId: id } });
    expect(certs).toHaveLength(60);
    expect(new Set(certs.map((c) => c.number)).size).toBe(60);
    expect(new Set(certs.map((c) => c.candidateId)).size).toBe(60);
    certs.forEach((c) => expect(c.number).toMatch(/^PSM-\d{4}-\d{6}$/));
    expect(await statusOf(id)).toBe("COMPLETED");

    // Fake provider: 30% errors, 20% "delivered but timed out", remembers idempotency keys.
    const delivered = new Map<string, string>();
    let calls = 0;
    const flaky: SendMessage = async ({ idempotencyKey, to }) => {
      calls++;
      if (delivered.has(idempotencyKey)) return { id: idempotencyKey };
      const roll = Math.random();
      if (roll < 0.3) throw new Error("provider returned 500");
      delivered.set(idempotencyKey, to);
      if (roll < 0.5) throw new Error("timeout");
      return { id: idempotencyKey };
    };
    for (const certId of pending) {
      for (let attempt = 1; attempt <= 30; attempt++) {
        try {
          await deliverCertificate(certId, issueCfg, flaky);
          break;
        } catch {
          /* the queue would retry with backoff; here we retry straight away */
        }
      }
    }
    expect(calls).toBeGreaterThan(60); // failures really happened
    expect(delivered.size).toBe(60); // ...yet every person got exactly one message
    expect(await prisma.delivery.count({ where: { certificate: { batchId: id }, status: "SENT" } })).toBe(60);
  });

  it("certificate history lists issued, a failed attempt, then sent", async () => {
    const id = await submittedBatch(3);
    for (const who of [people.dev, people.meera, people.farah]) await approve(who, id);
    const [certId] = await issueCertificates(id, issueCfg);
    const fail: SendMessage = async () => { throw new Error("provider returned 500"); };
    await expect(deliverCertificate(certId, issueCfg, fail)).rejects.toThrow(/500/);
    await deliverCertificate(certId, issueCfg, async () => ({ id: "msg-1" }));
    const history = await prisma.auditLog.findMany({
      where: { entityType: "certificate", entityId: certId },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.action)).toEqual(["CERTIFICATE_ISSUED", "WHATSAPP_ATTEMPT_FAILED", "WHATSAPP_SENT"]);
  });
});

describe("Moment 4: a cancelled certificate is invalid immediately", () => {
  it("verify shows CANCELLED right after the state office cancels, even with a warm cache", async () => {
    const id = await submittedBatch(3);
    for (const who of [people.dev, people.meera, people.farah]) await approve(who, id);
    await issueCertificates(id, issueCfg);
    const cert = await prisma.certificate.findFirstOrThrow({ where: { batchId: id } });

    const before = await verifyCertificate(cert.number, redis);
    expect(before.status).toBe("VALID");
    expect(JSON.stringify(before)).not.toContain(cert.phone); // no personal data in public results
    if (before.status === "VALID") expect(before.holder).toMatch(/^\w\*+/);

    await expectHttp(cancelCertificate({ user: await people.dev() }, cert.id, "fake", redis), 403);
    await cancelCertificate({ user: await people.farah() }, cert.id, "Issued by mistake", redis);
    expect((await verifyCertificate(cert.number, redis)).status).toBe("CANCELLED");
  });

  it("unknown and malformed numbers", async () => {
    expect((await verifyCertificate("PSM-2026-999999", redis)).status).toBe("NOT_FOUND");
    await expectHttp(verifyCertificate("DROP TABLE", redis), 400);
  });
});

describe("Moment 5: a stuck batch is escalated without anyone chasing it", () => {
  it("escalates once after the limit, and only once", async () => {
    const id = await submittedBatch(3);
    await prisma.batch.update({ where: { id }, data: { stepEnteredAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) } });
    const sla = { district: 2880, quality: 2880, state: 1440 };
    expect(await escalateStuckBatches(sla)).toEqual([id]);
    expect(await escalateStuckBatches(sla)).toEqual([]);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "BATCH_ESCALATED" } })).toBe(1);
  });

  it("does not escalate a batch inside its limit", async () => {
    await submittedBatch(3);
    expect(await escalateStuckBatches({ district: 2880, quality: 2880, state: 1440 })).toEqual([]);
  });
});

describe("Moment 6: send back, fix, resend (decision D4: earlier approvals are cleared)", () => {
  it("old approvals stop counting, but stay in the history", async () => {
    const id = await submittedBatch(3);
    const anika = await people.anika();
    await approve(people.dev, id);
    await reviewBatch({ user: await people.meera() }, id, { decision: "SEND_BACK", reason: "Row 2 has a wrong name" }, QUALITY_MIN);
    expect(await statusOf(id)).toBe("RETURNED");

    await uploadCandidates({ user: anika }, id, csvFor(3));
    await submitBatch({ user: anika }, id);
    const batch = await prisma.batch.findUniqueOrThrow({ where: { id } });
    expect(batch).toMatchObject({ status: "DISTRICT_REVIEW", cycle: 2 });

    await approve(people.dev, id); // Dev's cycle-1 approval does not count; this is a new one
    expect(await statusOf(id)).toBe("DISTRICT_REVIEW");
    await approve(people.kabir, id);
    expect(await statusOf(id)).toBe("STATE_REVIEW");
    expect(await prisma.approval.count({ where: { batchId: id } })).toBe(4); // full history kept
  });

  it("a rejected batch is final", async () => {
    const id = await submittedBatch(3);
    await reviewBatch({ user: await people.dev() }, id, { decision: "REJECT", reason: "Not our centre" }, QUALITY_MIN);
    await expectHttp(submitBatch({ user: await people.anika() }, id), 409);
  });
});

describe("Never: a decision nobody can trace", () => {
  it("every decision is in the audit log and the log cannot be edited", async () => {
    const id = await submittedBatch(3);
    await approve(people.dev, id);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "REVIEW_APPROVE" } });
    expect(row).toMatchObject({ actorName: "Dev", fromState: "DISTRICT_REVIEW" });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { reason: "edited" } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });

  it("submitting twice is harmless", async () => {
    const anika = await people.anika();
    const batch = await createBatch({ user: anika }, { name: "Double click", courseCode: "ELEC-101" });
    await uploadCandidates({ user: anika }, batch.id, csvFor(2));
    const [a, b] = await Promise.all([submitBatch({ user: anika }, batch.id), submitBatch({ user: anika }, batch.id)]);
    expect([a.changed, b.changed].sort()).toEqual([false, true]);
  });
});
