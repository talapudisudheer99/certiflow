import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { logger } from "./logger";
import type IORedis from "ioredis";
import { authRouter, type UserStore } from "./auth";
import { HttpError } from "./lib/http";
import { prisma } from "./db";
import { batchesRouter } from "./routes/batches";
import { certificateHistoryRouter, publicRouter, stateRouter } from "./routes/certificates";
import { eventsRouter } from "./routes/events";

// Dependencies are injected so tests can run the app without a real database or Redis.
export interface Deps {
  sessionSecret: string;
  secureCookies?: boolean;
  users: UserStore;
  checkDb: () => Promise<void>;
  checkRedis: () => Promise<void>;
  // Feature routes need the database. Left out in the unit tests for auth and health.
  features?: {
    redis: IORedis | null;
    redisUrl: string;
    qualityMinSize: number;
    hmacSecret: string;
    publicBaseUrl: string;
  };
}

export function createApp(deps: Deps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "3mb" })); // a 5,000-row CSV is about 400 KB
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

  if (deps.features) {
    const f = deps.features;
    const certDeps = { users: deps.users, redis: f.redis, hmacSecret: f.hmacSecret, publicBaseUrl: f.publicBaseUrl };
    api.use("/batches", batchesRouter(deps.users, { qualityMinSize: f.qualityMinSize }));
    api.use("/", eventsRouter(deps.users, f.redisUrl));
    api.use("/state", stateRouter(certDeps));
    api.use("/", certificateHistoryRouter(certDeps));
    api.use("/", publicRouter(certDeps));
  }
  app.use("/api", api);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      // Refused actions are traced too (US-10), without personal data.
      if (deps.features && req.user && req.method !== "GET" && (err.status === 403 || err.status === 409)) {
        prisma.auditLog
          .create({
            data: {
              actorId: req.user.id, actorName: req.user.name, action: "ACTION_REFUSED", entityType: "request",
              entityId: `${req.method} ${req.originalUrl}`.slice(0, 200), reason: err.message, requestId: res.locals.requestId,
            },
          })
          .catch((e) => logger.warn({ e }, "could not audit refused action"));
      }
      logger.info({ requestId: res.locals.requestId, status: err.status, path: req.originalUrl, userId: req.user?.id }, err.message);
      return res.status(err.status).json({ error: err.message, details: err.details, requestId: res.locals.requestId });
    }
    if (err instanceof Error && err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", requestId: res.locals.requestId });
    }
    logger.error({ err, requestId: res.locals.requestId }, "unhandled error");
    res.status(500).json({ error: "Something went wrong", requestId: res.locals.requestId });
  });

  return app;
}
