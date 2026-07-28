/**
 * Seed the `MailIdentity` registry — the set of addresses the mail-sync worker
 * treats as "ours". Without these rows every archived message looks INBOUND, so
 * a manager's own outgoing copy would be misfiled and could raise a bogus task.
 *
 * Idempotent: upserts by `address`. Manager rows link to the matching `User`
 * (by email) so outgoing mail gets the right author; a shared/service box, or a
 * manager without a platform account yet, is left with `userId = null`.
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
  { address: "info@geleoteka.ru", type: "SHARED", who: "Общий ящик / From транзакционных писем" },
  { address: "crm-archive@geleoteka.ru", type: "ARCHIVE", who: "Служебный архив исходящих (не выдавать людям)" },
  { address: "sales@geleoteka.ru", type: "MANAGER", who: "Михаил Вишняков — гендир" },
  { address: "service@geleoteka.ru", type: "MANAGER", who: "Дима — менеджер контент" },
  { address: "parts@geleoteka.ru", type: "MANAGER", who: "Митя Ляхов — менеджер запчасти" },
  { address: "bablo@geleoteka.ru", type: "MANAGER", who: "Владислав Полтавский — финансист" },
  { address: "support@geleoteka.ru", type: "MANAGER", who: "Алекс — админ/разработчик" },
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
