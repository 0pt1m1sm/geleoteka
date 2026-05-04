/**
 * Normalize Part.compatibleModels from bare model names ("G-Class") to
 * "<Model> <Generation>" denormalized strings ("G-Class W463", "G-Class W464").
 *
 * Usage:
 *   npx tsx scripts/normalize-compatible-models.ts          # dry-run (default) — prints diff
 *   npx tsx scripts/normalize-compatible-models.ts --apply  # writes inside a transaction
 *
 * Idempotent: entries that already contain a space (already migrated) are kept as-is.
 * Run BEFORE deploying the public-site-refresh changes — afterwards the picker hard-filter
 * uses `compatibleModels: { has: "<Model> <Generation>" }` which won't match bare names.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { MODEL_GENERATIONS } from "@/lib/models-data";

function expand(entry: string): string[] {
  const trimmed = entry.trim();
  if (!trimmed) return [];
  // Already has generation (contains a space inside the value)
  if (trimmed.includes(" ")) return [trimmed];
  // Bare model name — expand to all known generations for that model
  const gens = MODEL_GENERATIONS[trimmed];
  if (!gens || gens.length === 0) {
    // Unknown model — leave as-is, the dry-run report will flag it for manual review
    return [trimmed];
  }
  return gens.map((g) => `${trimmed} ${g}`);
}

function normalize(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    for (const e of expand(v)) out.add(e);
  }
  return Array.from(out);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const parts = await db.part.findMany({
    select: { id: true, slug: true, compatibleModels: true },
  });

  let changedCount = 0;
  let unchangedCount = 0;
  const unknownEntries = new Set<string>();
  const updates: Array<{ id: string; slug: string; before: string[]; after: string[] }> = [];

  for (const p of parts) {
    const before = (p as { compatibleModels: string[] }).compatibleModels;
    const after = normalize(before);
    const equal =
      before.length === after.length && before.every((v, i) => v === after[i]);
    if (equal) {
      unchangedCount += 1;
      continue;
    }
    for (const v of before) {
      if (!v.includes(" ") && !MODEL_GENERATIONS[v]) {
        unknownEntries.add(v);
      }
    }
    updates.push({ id: (p as { id: string }).id, slug: (p as { slug: string }).slug, before, after });
    changedCount += 1;
  }

  console.log(`\n=== compatibleModels normalization ===`);
  console.log(`Mode: ${apply ? "APPLY (writing changes)" : "DRY-RUN (no writes)"}`);
  console.log(`Total parts: ${parts.length}`);
  console.log(`Unchanged: ${unchangedCount}`);
  console.log(`To change: ${changedCount}`);

  if (unknownEntries.size > 0) {
    console.log(`\nWARNING — bare entries with no known model in MODEL_GENERATIONS (left as-is, manual review needed):`);
    for (const v of Array.from(unknownEntries).sort()) console.log(`  • ${v}`);
  }

  if (updates.length > 0) {
    console.log(`\nDiff:`);
    for (const u of updates) {
      console.log(`  [${u.slug}]`);
      console.log(`    - ${JSON.stringify(u.before)}`);
      console.log(`    + ${JSON.stringify(u.after)}`);
    }
  }

  if (!apply) {
    console.log(`\nDry-run complete. Re-run with --apply to write the changes inside a transaction.`);
    return;
  }

  if (updates.length === 0) {
    console.log(`\nNothing to write. Done.`);
    return;
  }

  console.log(`\nApplying ${updates.length} updates inside a transaction...`);
  await db.$transaction(
    updates.map((u) =>
      db.part.update({ where: { id: u.id }, data: { compatibleModels: u.after } })
    )
  );
  console.log(`Wrote ${updates.length} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
