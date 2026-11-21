import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

import type { UserStore } from "../src/auth";

const users: UserStore = { listUsers: async () => [], findUser: async () => null };
const base = { sessionSecret: "x".repeat(32), users };
const up = async () => {};
const down = async () => {
  throw new Error("down");
};

describe("GET /api/health", () => {
  it("reports ok when the database and Redis are up", async () => {
    const res = await request(createApp({ ...base, checkDb: up, checkRedis: up })).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up", redis: "up" });
  });

  it("reports degraded (503) when Redis is down", async () => {
    const res = await request(createApp({ ...base, checkDb: up, checkRedis: down })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "up", redis: "down" });
  });

  it("returns 404 for unknown routes and sets a request id", async () => {
    const res = await request(createApp({ ...base, checkDb: up, checkRedis: up })).get("/nope");
    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
