import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { logger } from "./logger";
import { authRouter, type UserStore } from "./auth";

// Dependencies are injected so tests can run the app without a real database or Redis.
export interface Deps {
  sessionSecret: string;
  secureCookies?: boolean;
  users: UserStore;
  checkDb: () => Promise<void>;
  checkRedis: () => Promise<void>;
}

export function createApp(deps: Deps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(deps.sessionSecret));

  // Every request gets an id: used in logs and (later) in the audit log.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  const api = express.Router();

  api.get("/health", async (_req, res) => {
    const [db, redis] = await Promise.allSettled([deps.checkDb(), deps.checkRedis()]);
    const ok = db.status === "fulfilled" && redis.status === "fulfilled";
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      db: db.status === "fulfilled" ? "up" : "down",
      redis: redis.status === "fulfilled" ? "up" : "down",
    });
  });

  api.use("/auth", authRouter(deps.users, deps.secureCookies ?? false));

  // Feature routes are added here, one router per feature (batches, reviews, verify...).
  app.use("/api", api);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, requestId: res.locals.requestId }, "unhandled error");
    res.status(500).json({ error: "Something went wrong", requestId: res.locals.requestId });
  });

  return app;
}
