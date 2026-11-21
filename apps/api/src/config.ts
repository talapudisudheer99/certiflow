import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WHATSAPP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  CERT_HMAC_SECRET: z.string().min(32),
  QUALITY_REVIEW_MIN_SIZE: z.coerce.number().int().positive().default(50),
  SLA_DISTRICT_MINUTES: z.coerce.number().int().positive().default(2880),
  SLA_QUALITY_MINUTES: z.coerce.number().int().positive().default(2880),
  SLA_STATE_MINUTES: z.coerce.number().int().positive().default(1440),
  // Where the worker writes certificate PDFs (a shared volume in Docker).
  STORAGE_DIR: z.string().default("storage"),
  // Base URL used in WhatsApp messages for the download and verify links.
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8080"),
  DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
});

export type Config = z.infer<typeof schema>;

// Called once at startup. Fails fast with a clear message if the environment is wrong.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
