import "dotenv/config";
import { db } from "../lib/db";

/**
 * Verifies that every active VehicleGeneration has at least one curated
 * (non-default) VehicleTrim row. Bare generations (only an `ALL` default trim)
 * indicate missing data and are reported as failures.
 *
 * Run: npm run verify-vehicle-trims
 * With allow-list: npm run verify-vehicle-trims -- --allow-bare g-class:W464
 *
 * The catalog seed (`prisma/seed-trims.ts`) is expected to populate every
 * generation; failures here mean the seed is out of date or a generation was
 * added without a corresponding curated block. Run the seed before this
 * script.
 */

interface BareGeneration {
  modelSlug: string;
  modelName: string;
  generationCode: string;
  yearFrom: number;
}

function parseAllowBare(args: string[]): Set<string> {
  const allow = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--allow-bare" && i + 1 < args.length) {
      const next = args[i + 1];
      // Comma-separated or single value: "g-class:W464,e-class:W124"
      for (const entry of next.split(",")) {
        const trimmed = entry.trim();
        if (trimmed) allow.add(trimmed);
      }
    }
  }
  return allow;
}

async function main(): Promise<void> {
  const allowBare = parseAllowBare(process.argv.slice(2));

  const rows = (await db.vehicleGeneration.findMany({
    where: { isActive: true, model: { isActive: true } },
    select: {
      code: true,
      yearFrom: true,
      model: { select: { slug: true, name: true } },
      _count: { select: { trims: { where: { isActive: true, isDefault: false } } } },
    },
    orderBy: [{ model: { name: "asc" } }, { yearFrom: "asc" }],
  })) as Array<{
    code: string;
    yearFrom: number;
    model: { slug: string; name: string };
    _count: { trims: number };
  }>;

  const total = rows.length;
  const totalCurated = rows.reduce((sum, r) => sum + r._count.trims, 0);
  const bare: BareGeneration[] = [];
  const allowedBare: BareGeneration[] = [];

  for (const r of rows) {
    if (r._count.trims === 0) {
      const key = `${r.model.slug}:${r.code}`;
      const entry: BareGeneration = {
        modelSlug: r.model.slug,
        modelName: r.model.name,
        generationCode: r.code,
        yearFrom: r.yearFrom,
      };
      if (allowBare.has(key)) {
        allowedBare.push(entry);
      } else {
        bare.push(entry);
      }
    }
  }

  console.log("=".repeat(70));
  console.log("Vehicle Trim Verification");
  console.log("=".repeat(70));
  console.log(`Total generations: ${total}`);
  console.log(`Total curated trims: ${totalCurated}`);
  console.log(`Average curated trims per generation: ${(totalCurated / Math.max(1, total)).toFixed(1)}`);
  console.log("");

  if (allowedBare.length > 0) {
    console.log(`✓ ${allowedBare.length} intentionally-bare generation(s) (--allow-bare):`);
    for (const b of allowedBare) {
      console.log(`  - ${b.modelName} ${b.generationCode} (${b.yearFrom}–)`);
    }
    console.log("");
  }

  if (bare.length === 0) {
    console.log("✓ Every generation has at least one curated trim.");
    process.exitCode = 0;
  } else {
    console.log(`✗ ${bare.length} generation(s) have no curated trims:`);
    for (const b of bare) {
      console.log(`  - ${b.modelName} ${b.generationCode} (${b.yearFrom}–) [${b.modelSlug}:${b.generationCode}]`);
    }
    console.log("");
    console.log("Fix: add a `CuratedGeneration` block in `prisma/seed-trims.ts` for each row above,");
    console.log("then run `npx prisma db seed` and re-run this script.");
    console.log("To intentionally allow a bare generation: --allow-bare <model-slug>:<chassis-code>");
    process.exitCode = 1;
  }
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
