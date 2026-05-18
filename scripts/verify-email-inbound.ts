/**
 * Unit-level verification for the inbound email utilities.
 *
 *   - verifyResendWebhook: valid sig, tampered body, tampered sig, old/future ts
 *   - shouldAcceptRecipient: info@ accepted, others rejected
 *   - parseFromAddress: "Name <addr>" + bare addr forms
 *   - extractHeader: case-insensitive lookup, missing → null
 *
 * Pure-TS, no DB. Run: `npm run verify-email-inbound`. Exits 1 on failure.
 */

import { createHmac } from "node:crypto";
import {
  verifyResendWebhook,
  shouldAcceptRecipient,
  parseFromAddress,
  extractHeader,
} from "../lib/email/inbound";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function sign(secret: string, svixId: string, ts: string, body: string): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${svixId}.${ts}.${body}`;
  return `v1,${createHmac("sha256", secretBytes).update(signed).digest("base64")}`;
}

function main(): void {
  console.log("[verify-email-inbound] starting");

  // Svix secret: `whsec_` prefix + base64 — same shape as Resend's dashboard.
  const secret = "whsec_" + Buffer.from("topsecretkey-with-some-entropy").toString("base64");
  const body = JSON.stringify({ type: "email.received", data: { email_id: "x" } });
  const nowSec = Math.floor(Date.now() / 1000);
  const id = "msg_test_1";
  const ts = String(nowSec);
  const sig = sign(secret, id, ts, body);

  // 1. Valid signature → ok.
  const ok = verifyResendWebhook({
    rawBody: body,
    headers: { svixId: id, svixTimestamp: ts, svixSignature: sig },
    secret,
    nowMs: nowSec * 1000,
  });
  assert(ok.ok, `valid sig should pass, got ${JSON.stringify(ok)}`);
  console.log("  ✓ valid signature accepted");

  // 2. Tampered body → reject.
  const tamperedBody = verifyResendWebhook({
    rawBody: body + "x",
    headers: { svixId: id, svixTimestamp: ts, svixSignature: sig },
    secret,
    nowMs: nowSec * 1000,
  });
  assert(!tamperedBody.ok, "tampered body must be rejected");
  console.log("  ✓ tampered body rejected");

  // 3. Tampered signature → reject.
  const tamperedSig = verifyResendWebhook({
    rawBody: body,
    headers: { svixId: id, svixTimestamp: ts, svixSignature: "v1,deadbeef" },
    secret,
    nowMs: nowSec * 1000,
  });
  assert(!tamperedSig.ok, "tampered sig must be rejected");
  console.log("  ✓ tampered signature rejected");

  // 4. Old timestamp (>5 min) → reject.
  const oldTs = String(nowSec - 600);
  const oldSig = sign(secret, id, oldTs, body);
  const old = verifyResendWebhook({
    rawBody: body,
    headers: { svixId: id, svixTimestamp: oldTs, svixSignature: oldSig },
    secret,
    nowMs: nowSec * 1000,
  });
  assert(!old.ok, "old timestamp must be rejected");
  console.log("  ✓ old timestamp rejected");

  // 5. Future timestamp (>5 min) → reject.
  const futureTs = String(nowSec + 600);
  const futureSig = sign(secret, id, futureTs, body);
  const future = verifyResendWebhook({
    rawBody: body,
    headers: { svixId: id, svixTimestamp: futureTs, svixSignature: futureSig },
    secret,
    nowMs: nowSec * 1000,
  });
  assert(!future.ok, "future timestamp must be rejected");
  console.log("  ✓ future timestamp rejected");

  // 6. Multi-signature header — only one must match.
  const multiSig = `v1,deadbeef ${sig.split(",")[0]},${sig.split(",")[1]}`;
  const multi = verifyResendWebhook({
    rawBody: body,
    headers: { svixId: id, svixTimestamp: ts, svixSignature: multiSig },
    secret,
    nowMs: nowSec * 1000,
  });
  assert(multi.ok, "multi-sig where one matches should pass");
  console.log("  ✓ multi-signature with one match accepted");

  // 7. shouldAcceptRecipient
  assert(shouldAcceptRecipient(["info@geleoteka.ru"]), "info@geleoteka.ru should be accepted");
  assert(
    shouldAcceptRecipient(["Geleoteka <info@geleoteka.ru>"]),
    "addr-with-display-name should be accepted",
  );
  assert(
    shouldAcceptRecipient(["INFO@GELEOTEKA.RU"]),
    "case-insensitive recipient match",
  );
  assert(
    shouldAcceptRecipient(["sales@geleoteka.ru", "info@geleoteka.ru"]),
    "any-one-match is enough",
  );
  assert(!shouldAcceptRecipient(["sales@geleoteka.ru"]), "non-info should be rejected");
  assert(!shouldAcceptRecipient([]), "empty to should be rejected");
  console.log("  ✓ shouldAcceptRecipient");

  // 8. parseFromAddress
  const a = parseFromAddress("Acme <hello@example.test>");
  assert(a.email === "hello@example.test" && a.name === "Acme", `parse failed: ${JSON.stringify(a)}`);
  const b = parseFromAddress("bare@example.test");
  assert(b.email === "bare@example.test" && b.name === undefined, `bare parse failed: ${JSON.stringify(b)}`);
  console.log("  ✓ parseFromAddress");

  // 9. extractHeader
  const headers = [
    { name: "Message-Id", value: "<msg1@x>" },
    { name: "in-reply-to", value: "<reply1@y>" },
    { name: "X-Other", value: "ignore" },
  ];
  assert(extractHeader(headers, "Message-Id") === "<msg1@x>", "exact header");
  assert(extractHeader(headers, "In-Reply-To") === "<reply1@y>", "case-insensitive lookup");
  assert(extractHeader(headers, "References") === null, "missing → null");
  console.log("  ✓ extractHeader");

  console.log("[verify-email-inbound] PASS");
}

main();
