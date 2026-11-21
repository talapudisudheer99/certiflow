import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

export type Role = "CENTRE" | "DISTRICT_OFFICER" | "QUALITY" | "STATE";
export type Person = { id: string; name: string; role: Role; districtId: string | null };

// Data access is injected so tests do not need a database.
export interface UserStore {
  listUsers: () => Promise<Person[]>;
  findUser: (id: string) => Promise<Person | null>;
}

export const SESSION_COOKIE = "certiflow_session";
const loginSchema = z.object({ userId: z.string().min(1) });

declare module "express-serve-static-core" {
  interface Request {
    user?: Person;
  }
}

// The person comes ONLY from the signed cookie, never from the request body.
export function authRouter(store: UserStore, secure: boolean) {
  const router = Router();

  router.get("/people", async (_req, res) => {
    res.json({ people: await store.listUsers() });
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a person to sign in as" });
    const user = await store.findUser(parsed.data.userId);
    if (!user) return res.status(400).json({ error: "Unknown person" });
    res.cookie(SESSION_COOKIE, user.id, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ user });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  router.get("/me", requireUser(store), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

// Use on any route that needs a signed-in person. A missing or tampered cookie gives 401.
export function requireUser(store: UserStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id: unknown = req.signedCookies?.[SESSION_COOKIE];
    if (typeof id !== "string") return res.status(401).json({ error: "Please sign in" });
    const user = await store.findUser(id);
    if (!user) return res.status(401).json({ error: "Please sign in" });
    req.user = user;
    next();
  };
}

// Use after requireUser: only these roles may continue, otherwise 403.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You are not allowed to do this" });
    }
    next();
  };
}
