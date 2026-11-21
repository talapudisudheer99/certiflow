import { describe, expect, it } from "vitest";
import { maskName, signDownload, verifyDownload } from "../src/lib/signing";

describe("signed download links (never: a stranger gets someone else's certificate)", () => {
  const secret = "s".repeat(40);
  it("accepts a valid link and rejects a tampered or expired one", () => {
    const { exp, sig } = signDownload(secret, "cert-1");
    expect(verifyDownload(secret, "cert-1", exp, sig)).toBe(true);
    expect(verifyDownload(secret, "cert-2", exp, sig)).toBe(false); // someone else's id
    expect(verifyDownload(secret, "cert-1", exp + 1, sig)).toBe(false); // edited expiry
    const old = signDownload(secret, "cert-1", 60, Date.now() - 3600_000);
    expect(verifyDownload(secret, "cert-1", old.exp, old.sig)).toBe(false); // expired
  });
  it("masks names", () => {
    expect(maskName("Anika Sharma")).toBe("A**** S*****");
  });
});
