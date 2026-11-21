import crypto from "node:crypto";

/** HMAC helpers: tamper-evident certificate hash and short-lived download links. */
export function hmac(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

/** Signed link valid for `ttlSeconds`: a stranger cannot fetch a PDF by guessing an id (US-14). */
export function signDownload(secret: string, certificateId: string, ttlSeconds = 7 * 24 * 3600, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { exp, sig: hmac(secret, `${certificateId}.${exp}`) };
}

export function verifyDownload(secret: string, certificateId: string, exp: number, sig: string, now = Date.now()) {
  if (!Number.isInteger(exp) || exp < Math.floor(now / 1000)) return false;
  const expected = hmac(secret, `${certificateId}.${exp}`);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** "Anika Sharma" -> "A**** S*****": the public verify page never shows full personal data. */
export function maskName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] + "*".repeat(Math.max(part.length - 1, 1)))
    .join(" ");
}
