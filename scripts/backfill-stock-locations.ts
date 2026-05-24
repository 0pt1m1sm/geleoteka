/**
 * Idempotent backfill: seed the StockLocation registry from the distinct
 * locations already referenced by StockBin placement rows. Existing locations
 * are created active + unblocked; a re-run never resets the block/active flags
 * of a location that already exists (create-only on conflict).
 *
 * Run: npm run backfill-stock-locations
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY, STAGING_LOCATION } from "../lib/wms-host";

function normalizeLocation(location: string): string {
  return location.trim().toUpperCase();
}

async function main(): Promise<void> {
  console.log("[backfill-stock-locations] starting");

  // System-critical staging cell: assert it exists AND is usable on every run.
  // Unlike the create-only loop below, this resets isActive/isBlocked so a stale
  // or manually-blocked ПРИЁМКА row can never silently break default receiving.
  const staging = normalizeLocation(STAGING_LOCATION);
  await db.stockLocation.upsert({
    where: { tenantKey_code: { tenantKey: TENANT_KEY, code: staging } },
    update: { isActive: true, isBlocked: false },
    create: { code: staging, tenantKey: TENANT_KEY, isActive: true, isBlocked: false },
  });
  console.log(`  staging location ${staging} asserted active + unblocked`);

  const bins = (await db.stockBin.findMany({
    where: { tenantKey: TENANT_KEY },
    select: { location: true },
    distinct: ["location"],
  })) as Array<{ location: string }>;

  const codes = Array.from(new Set(bins.map((b) => normalizeLocation(b.location)).filter(Boolean)));
  console.log(`  found ${codes.length} distinct StockBin location(s)`);

  let created = 0;
  for (const code of codes) {
    const existing = await db.stockLocation.findUnique({
      where: { tenantKey_code: { tenantKey: TENANT_KEY, code } },
      select: { id: true },
    });
    if (existing) continue; // never reset isActive/isBlocked of an existing location
    await db.stockLocation.create({
      data: { code, tenantKey: TENANT_KEY, isActive: true, isBlocked: false },
    });
    created += 1;
  }

  console.log(`  created ${created} new StockLocation row(s); ${codes.length - created} already present`);
  console.log("[backfill-stock-locations] done");
}

main()
  .catch((err) => {
    console.error("[backfill-stock-locations] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
