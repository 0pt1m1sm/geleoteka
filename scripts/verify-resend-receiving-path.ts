/**
 * Verifies the fixed Resend receiving API path against the real upstream.
 *
 * Background: commit 8885e8e changed `lib/email/inbound.ts` from
 *   GET https://api.resend.com/emails/{id}/receiving        (returned 405)
 * to
 *   GET https://api.resend.com/emails/receiving/{id}        (per Resend docs)
 *
 * This script reads RESEND_API_KEY from the Setting table and calls
 * fetchResendEmailContent() with the given email_id. Expected: 200 + non-empty
 * envelope. We bypass lib/settings.ts because that file imports server-only.
 *
 * Run: `npx tsx scripts/verify-resend-receiving-path.ts <email_id>`
 *      (defaults to the 22:10 failed-delivery email_id)
 */

import "dotenv/config";
import { db } from "../lib/db";
import { fetchResendEmailContent } from "../lib/email/inbound";

const EMAIL_ID = process.argv[2] ?? "23b50a68-e991-4bb7-92a8-86fa06fbf9b5";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("[verify-resend-receiving-path] starting");
  console.log(`  email_id=${EMAIL_ID}`);

  const setting = (await db.setting.findUnique({
    where: { key: "RESEND_API_KEY" },
    select: { value: true },
  })) as { value: string } | null;
  const apiKey = setting?.value ?? process.env.RESEND_API_KEY;
  assert(apiKey, "RESEND_API_KEY not set in DB Setting or env");
  console.log(`  ✓ RESEND_API_KEY present (length=${apiKey.length})`);

  try {
    const content = await fetchResendEmailContent(EMAIL_ID, apiKey);
    console.log("  ✓ fetchResendEmailContent succeeded (HTTP 200)");
    console.log(`    html present: ${content.html !== null ? "yes" : "no"} (length=${content.html?.length ?? 0})`);
    console.log(`    text present: ${content.text !== null ? "yes" : "no"} (length=${content.text?.length ?? 0})`);
    console.log(`    headers: ${content.headers.length} entries`);
    console.log(`    attachments: ${content.attachments?.length ?? 0}`);
  } catch (err) {
    console.error("  ✗ fetchResendEmailContent threw:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("[verify-resend-receiving-path] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-resend-receiving-path] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
