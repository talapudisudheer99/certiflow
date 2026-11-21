import crypto from "node:crypto";
import express from "express";

// A stand-in for the WhatsApp provider. It behaves like the real thing:
//  - sometimes fails with a 500 (message NOT sent)
//  - sometimes delivers the message but never answers (the caller sees a timeout)
//  - remembers idempotency keys, so a retry never sends a second message
const rates = {
  fail: Number(process.env.STUB_FAIL_RATE ?? 0.2),
  timeout: Number(process.env.STUB_TIMEOUT_RATE ?? 0.1),
  timeoutMs: Number(process.env.STUB_TIMEOUT_MS ?? 15000),
};

type Sent = { id: string; to: string; text: string; at: string };
const sentByKey = new Map<string, Sent>();

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/v1/messages", (req, res) => {
  const { to, text, idempotencyKey } = req.body ?? {};
  if (typeof to !== "string" || typeof text !== "string" || typeof idempotencyKey !== "string") {
    return res.status(400).json({ error: "to, text and idempotencyKey are required" });
  }

  // Same key again: answer with the original message, send nothing new.
  const existing = sentByKey.get(idempotencyKey);
  if (existing) return res.status(200).json({ id: existing.id, duplicate: true });

  if (Math.random() < rates.fail) {
    return res.status(500).json({ error: "provider error" });
  }

  const message: Sent = { id: crypto.randomUUID(), to, text, at: new Date().toISOString() };
  sentByKey.set(idempotencyKey, message);

  if (Math.random() < rates.timeout) {
    // Delivered, but we "forget" to answer. The caller must retry with the same key.
    setTimeout(() => res.status(201).json({ id: message.id }), rates.timeoutMs);
    return;
  }
  return res.status(201).json({ id: message.id });
});

// What the provider has really sent. Used by tests and the demo.
app.get("/v1/messages", (_req, res) => {
  res.json({ count: sentByKey.size, messages: [...sentByKey.values()] });
});

// Change behaviour at runtime, for example to simulate an outage: {"fail": 1}
app.post("/admin/rates", (req, res) => {
  const { fail, timeout } = req.body ?? {};
  if (typeof fail === "number") rates.fail = fail;
  if (typeof timeout === "number") rates.timeout = timeout;
  res.json(rates);
});

const port = Number(process.env.STUB_PORT ?? 4100);
app.listen(port, () => console.log(`whatsapp-stub listening on ${port}`, rates));
