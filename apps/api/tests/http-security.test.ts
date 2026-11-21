import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { signDownload } from "../src/lib/signing";
import { resetDb } from "./helpers";

const secret = "s".repeat(32);
const hmacSecret = "h".repeat(32);

function app() {
  return createApp({
    sessionSecret: secret,
    users: {
      listUsers: async () => [],
      findUser: async (id) => {
        const u = await prisma.user.findUnique({ where: { id } });
        return u ? { id: u.id, name: u.name, role: u.role, districtId: u.districtId, centreId: u.centreId } : null;
      },
    },
    checkDb: async () => {},
    checkRedis: async () => {},
    features: { redis: null, redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379/1", qualityMinSize: 50, hmacSecret, publicBaseUrl: "http://localhost:8080" },
  });
}

async function cookie(userId: string) {
  const login = await request(app()).post("/api/auth/login").send({ userId });
  return login.headers["set-cookie"];
}

describe("HTTP never-rules", () => {
  beforeAll(async () => {
    await resetDb();
    await prisma.centre.create({ data: { id: "centre-south", name: "South Centre", districtId: "district-south" } });
    await prisma.batch.create({
      data: {
        id: "batch-south", name: "South district batch", courseCode: "ELEC-101", centreId: "centre-south",
        createdById: "user-anika", status: "DISTRICT_REVIEW",
      },
    });
  });

  it("refuses a centre reviewing its own batch (403)", async () => {
    const res = await request(app()).post("/api/batches/batch-flow-district/review").set("Cookie", await cookie("user-anika")).send({ decision: "APPROVE" });
    expect(res.status).toBe(403);
  });

  it("hides another district's batch (404)", async () => {
    const res = await request(app()).post("/api/batches/batch-south/review").set("Cookie", await cookie("user-dev")).send({ decision: "APPROVE" });
    expect(res.status).toBe(404);
  });

  it("refuses the state office at the district step (409)", async () => {
    const res = await request(app()).post("/api/batches/batch-flow-district/review").set("Cookie", await cookie("user-farah")).send({ decision: "APPROVE" });
    expect(res.status).toBe(409);
  });

  it("rejects a tampered cookie (401)", async () => {
    const res = await request(app()).get("/api/batches").set("Cookie", "certiflow_session=s%3Auser-farah.forged");
    expect(res.status).toBe(401);
  });

  it("ignores a user id sent in the body", async () => {
    const asAnika = await request(app())
      .post("/api/batches/batch-flow-district/review")
      .set("Cookie", await cookie("user-anika"))
      .send({ decision: "APPROVE", userId: "user-farah", officerId: "user-farah" });
    expect(asAnika.status).toBe(403);

    const asDev = await request(app())
      .post("/api/batches/batch-flow-district/review")
      .set("Cookie", await cookie("user-dev"))
      .send({ decision: "APPROVE", userId: "user-anika", officerId: "user-anika" });
    expect(asDev.status).toBe(200);
    const seen = await request(app()).get("/api/batches/batch-flow-district").set("Cookie", await cookie("user-dev"));
    const officers = (seen.body.approvals as { officerId: string }[]).map((a) => a.officerId);
    expect(officers).toContain("user-dev");
    expect(officers).not.toContain("user-anika");
    expect(officers).not.toContain("user-farah");
  });

  it("keeps state-office routes for the state office (403)", async () => {
    const res = await request(app()).get("/api/state/stuck").set("Cookie", await cookie("user-dev"));
    expect(res.status).toBe(403);
  });

  it("rejects a badly shaped certificate number (400)", async () => {
    const res = await request(app()).get("/api/verify/not-a-number");
    expect(res.status).toBe(400);
  });

  it("slows down someone guessing certificate numbers (429)", async () => {
    const limited = app();
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await request(limited).get("/api/verify/PSM-2099-000001");
      codes.push(res.status);
    }
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes[30]).toBe(429);
  });

  it("refuses a download link with an edited signature or the wrong certificate (403)", async () => {
    const certs = await prisma.certificate.findMany({ where: { batchId: "batch-flow-completed" }, take: 2, orderBy: { number: "asc" } });
    expect(certs.length).toBe(2);
    const link = signDownload(hmacSecret, certs[0].id);
    const edited = link.sig.replace(/^./, link.sig[0] === "a" ? "b" : "a");
    const badSig = await request(app()).get(`/api/certificates/${certs[0].id}/pdf?exp=${link.exp}&sig=${edited}`);
    expect(badSig.status).toBe(403);
    const wrongId = await request(app()).get(`/api/certificates/${certs[1].id}/pdf?exp=${link.exp}&sig=${link.sig}`);
    expect(wrongId.status).toBe(403);
  });
  it("a batch you already approved is not in your queue, but is in the other officers' queue", async () => {
    // Seed: Dev has approved batch-flow-district; it waits for Meera or Kabir.
    const dev = await request(app()).get("/api/batches?waiting=1").set("Cookie", await cookie("user-dev"));
    const meera = await request(app()).get("/api/batches?waiting=1").set("Cookie", await cookie("user-meera"));
    const ids = (r: request.Response) => (r.body.batches as { id: string }[]).map((b) => b.id);
    expect(ids(dev)).not.toContain("batch-flow-district");
    expect(ids(meera)).toContain("batch-flow-district");
  });
});
