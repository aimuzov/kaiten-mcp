import { createHash, timingSafeEqual } from "node:crypto";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Проверяет PKCE по методу S256: base64url(sha256(verifier)) === challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const computed = base64url(createHash("sha256").update(codeVerifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
