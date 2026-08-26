/**
 * Seed the `MailIdentity` registry — the set of addresses the mail-sync worker
 * treats as "ours". Without these rows every archived message looks INBOUND, so
 * an outgoing copy would be misfiled and could raise a bogus task.
 *
 * Model: functional/departmental mailboxes (sales/support) are SHARED — people
 * are NOT tied to a mailbox. Managers are separate platform
 * accounts (their own personal email) who send "as" a functional box; the author
 * of an outgoing message comes from the logged-in user, not the mailbox, so all
 * these rows carry `userId = null`. `sales@` doubles as the general/transactional
 * address (info@ folded into it). `crm-archive@` is the outbound-archive service box.
 *
 * Idempotent: upserts by `address`; addresses listed in RETIRED are switched to
 * `isActive = false` (rows are kept so archived history still resolves).
 *
 * Run against the target DB (prod: via the allow-listed operator IP):
 *   DATABASE_URL=<url> npx tsx scripts/seed-mail-identities.ts
 */

import "dotenv/config";
import { db } from "../lib/db";

type IdentityType = "MANAGER" | "SHARED" | "TRANSACTIONAL" | "ARCHIVE";

interface Seed {
  address: string;
  type: IdentityType;
  /** Human note; not used by the worker. */
  who: string;
}

const IDENTITIES: Seed[] = [
  { address: "sales@geleoteka.ru", type: "SHARED", who: "Продажи + общий/транзакционный адрес (info@ свёрнут сюда)" },
  { address: "support@geleoteka.ru", type: "SHARED", who: "Поддержка / админ" },
  { address: "crm-archive@geleoteka.ru", type: "ARCHIVE", who: "Служебный архив исходящих (не выдавать людям)" },
];

/**
 * Mailboxes that no longer exist on Timeweb (deleted 2026-08-26 to cut the mail
 * bill: service@/parts@ folded into sales@; info@/bablo@ retired 2026-07-30).
 * Kept here so a re-seed deactivates them rather than leaving stale "ours" rows.
 */
const RETIRED: string[] = [
  "service@geleoteka.ru",
  "parts@geleoteka.ru",
  "info@geleoteka.ru",
  "bablo@geleoteka.ru",
];

async function main(): Promise<void> {
  console.log("[seed-mail-identities] starting");

  for (const seed of IDENTITIES) {
    const address = seed.address.trim().toLowerCase();

    // Link managers to their platform account when one exists, so outbound mail
    // is attributed. Shared/service boxes intentionally stay author-less.
    let userId: string | null = null;
    if (seed.type === "MANAGER") {
      const user = (await db.user.findFirst({
        where: { email: address },
        select: { id: true },
      })) as { id: string } | null;
      userId = user?.id ?? null;
    }

    await db.mailIdentity.upsert({
      where: { address },
      update: { type: seed.type, userId, isActive: true },
      create: { address, type: seed.type, userId, isActive: true },
    });

    const link = seed.type === "MANAGER" ? (userId ? `→ user ${userId}` : "→ (no account yet)") : "";
    console.log(`  ✓ ${address}  [${seed.type}]  ${link}  — ${seed.who}`);
  }

  const retired = (await db.mailIdentity.updateMany({
    where: { address: { in: RETIRED }, isActive: true },
    data: { isActive: false },
  })) as { count: number };
  if (retired.count > 0) console.log(`  ✗ deactivated ${retired.count} retired identit${retired.count === 1 ? "y" : "ies"}`);

  console.log("[seed-mail-identities] done");
}

main()
  .catch((err) => {
    console.error("[seed-mail-identities] ERROR", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
