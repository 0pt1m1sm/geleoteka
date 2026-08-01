import { createHash, timingSafeEqual } from "node:crypto";

/** Compare secret material without an early content or length mismatch return. */
export function constantTimeSecretEqual(presented: string, expected: string): boolean {
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

