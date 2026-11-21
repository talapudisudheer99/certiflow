import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { resetDb, people } from "./helpers";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

function app() {
  return createApp({
    sessionSecret: "m".repeat(32),
    users: {
      listUsers: async () => [],
      findUser: async (id) => {
        const u = await prisma.user.findUnique({ where: { id } });
        return u ? { id: u.id, name: u.name, role: u.role, districtId: u.districtId, centreId: u.centreId } : null;
      },
    },
    checkDb: async () => {},
    checkRedis: async () => {},
    features: {
      redis: null,
      redisUrl,
      qualityMinSize: 50,
      hmacSecret: "h".repeat(32),
      publicBaseUrl: "http://localhost:8080",
    },
  });
}

describe("GET /api/metrics", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is only for the state office and reports queue and delivery counts", async () => {
    const centre = await request(app()).post("/api/auth/login").send({ userId: (await people.anika()).id });
    const denied = await request(app()).get("/api/metrics").set("Cookie", centre.headers["set-cookie"]);
    expect(denied.status).toBe(403);

    const state = await request(app()).post("/api/auth/login").send({ userId: (await people.farah()).id });
    const res = await request(app()).get("/api/metrics").set("Cookie", state.headers["set-cookie"]);
    expect(res.status).toBe(200);
    expect(res.body.queues["certiflow-events"]).toMatchObject({ waiting: expect.any(Number), active: expect.any(Number), failed: expect.any(Number) });
    expect(res.body.queues["certiflow-delivery"]).toMatchObject({ waiting: expect.any(Number), active: expect.any(Number), failed: expect.any(Number) });
    expect(res.body.deliveries.SENT).toBeGreaterThan(0);
    expect(typeof res.body.unpublishedOutbox).toBe("number");
    expect(res.body.stuckBatches).toBeGreaterThanOrEqual(1);
  });
});
