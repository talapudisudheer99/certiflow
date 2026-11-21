import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import type { Person, UserStore } from "../src/auth";

const dev: Person = { id: "user-dev", name: "Dev", role: "DISTRICT_OFFICER", districtId: "district-north", centreId: null };
const users: UserStore = {
  listUsers: async () => [dev],
  findUser: async (id) => (id === dev.id ? dev : null),
};
const app = () =>
  createApp({ sessionSecret: "s".repeat(32), users, checkDb: async () => {}, checkRedis: async () => {} });

describe("demo sign in", () => {
  it("lists the demo people", async () => {
    const res = await request(app()).get("/api/auth/people");
    expect(res.body.people).toHaveLength(1);
  });

  it("rejects /me without a cookie (401)", async () => {
    expect((await request(app()).get("/api/auth/me")).status).toBe(401);
  });

  it("rejects an unknown person (400)", async () => {
    expect((await request(app()).post("/api/auth/login").send({ userId: "nobody" })).status).toBe(400);
  });

  it("signs in with an HttpOnly signed cookie, then /me returns the person", async () => {
    const agent = request.agent(app());
    const login = await agent.post("/api/auth/login").send({ userId: dev.id });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.name).toBe("Dev");
  });

  it("rejects a tampered cookie (401)", async () => {
    const res = await request(app()).get("/api/auth/me").set("Cookie", "certiflow_session=s%3Auser-dev.forged");
    expect(res.status).toBe(401);
  });
});
