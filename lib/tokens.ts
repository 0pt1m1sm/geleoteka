import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of two secret tokens (claim tokens, etc.). Returns
 *  false for any null/empty/length-mismatch, and never short-circuits on content
 *  so it does not leak length/prefix via timing. */
export function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
