/**
 * Sanity-checks for the post-checkout account claim helpers. Pure TS — no DB
 * connection, no Prisma. Run via `npm run verify-customer-onboarding`. Exits 1
 * on any failure. Mirrors the existing `scripts/verify-cms.ts` convention.
 *
 * Two of the helpers (generateTempPasswordHash, generateClaimToken) hit
 * Node's crypto APIs and bcryptjs — those are deterministic enough to cover
 * via runtime asserts.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  generateClaimToken,
  generateTempPasswordHash,
  isValidPassword,
  PHONE_COLLISION_ERROR,
} from "../lib/customer-onboarding";

let failures = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n━━ ${title} ━━`);
}

// ── isValidPassword ──────────────────────────────────────────────────────
section("isValidPassword");
{
  const r = isValidPassword("12345");
  check("rejects 5 chars", !r.ok && r.error.includes("минимум 6"));
}
{
  const r = isValidPassword("");
  check("rejects empty", !r.ok);
}
{
  const r = isValidPassword("123456");
  check("accepts 6 chars", r.ok);
}
{
  const r = isValidPassword("a-very-long-secure-password!");
  check("accepts long password", r.ok);
}

// ── generateClaimToken ───────────────────────────────────────────────────
section("generateClaimToken");
{
  const t = generateClaimToken();
  check("64 hex chars", /^[0-9a-f]{64}$/.test(t), `got=${t.slice(0, 16)}…`);
}
{
  const a = generateClaimToken();
  const b = generateClaimToken();
  check("two calls return different tokens", a !== b);
}

// ── timingSafeEqual contract (regression for tokensMatch in actions) ─────
section("timingSafeEqual contract");
{
  const ok = crypto.timingSafeEqual(Buffer.from("abc"), Buffer.from("abc"));
  check("equal-length equal-bytes returns true", ok === true);
}
{
  const ok = crypto.timingSafeEqual(Buffer.from("abc"), Buffer.from("abd"));
  check("equal-length different-bytes returns false", ok === false);
}
{
  let threw = false;
  try {
    crypto.timingSafeEqual(Buffer.from("a"), Buffer.from("ab"));
  } catch {
    threw = true;
  }
  check("different lengths throw (action wraps in try/catch via length check)", threw);
}

async function runAsyncSections(): Promise<void> {
  section("generateTempPasswordHash");
  {
    const h1 = await generateTempPasswordHash();
    const h2 = await generateTempPasswordHash();
    check("returns string", typeof h1 === "string" && h1.length > 30);
    check("two calls return different hashes", h1 !== h2);
    // rounds=10 is intentional — temp hashes are throwaway markers, not
    // verifiable secrets (real passwords use rounds=12; see lib/customer-onboarding.ts).
    check("hash format is bcrypt rounds=10", /^\$2[ab]\$10\$/.test(h1), `got=${h1.slice(0, 8)}`);
    const weakMatch = await bcrypt.compare("password", h1);
    check("hash does not match weak seed 'password'", !weakMatch);
    const emptyMatch = await bcrypt.compare("", h1);
    check("hash does not match empty string", !emptyMatch);
  }

  section("PHONE_COLLISION_ERROR constant");
  {
    check(
      "message mentions телефон/email",
      /телефон/i.test(PHONE_COLLISION_ERROR) && /email/i.test(PHONE_COLLISION_ERROR),
      PHONE_COLLISION_ERROR,
    );
    check(
      "message starts with «Этот телефон»",
      PHONE_COLLISION_ERROR.startsWith("Этот телефон"),
    );
  }

  console.log(`\nSummary: ${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}`);
  process.exit(failures > 0 ? 1 : 0);
}

runAsyncSections().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
