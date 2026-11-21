import { Router } from "express";
import { requireUser, type UserStore } from "../auth";
import { EVENTS_CHANNEL, canSeeEvent, type BatchEvent } from "../lib/events";
import { createRedis } from "../redis";

/** One-way live updates. Each browser gets its own Redis subscription. */
export function eventsRouter(users: UserStore, redisUrl: string) {
  const router = Router();
  router.get("/events", requireUser(users), async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": connected\n\n");

    const sub = createRedis(redisUrl);
    const beat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    const close = () => {
      clearInterval(beat);
      sub.disconnect();
    };
    req.on("close", close);

    sub.on("message", (_channel: string, message: string) => {
      let event: BatchEvent;
      try {
        event = JSON.parse(message) as BatchEvent;
      } catch {
        return;
      }
      if (!canSeeEvent(req.user!, event)) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    await sub.subscribe(EVENTS_CHANNEL);
  });
  return router;
}
