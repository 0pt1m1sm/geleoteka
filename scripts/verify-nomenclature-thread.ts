/**
 * Verifies the nomenclature thread (docs/plans/2026-08-18-nomenclature-thread.md)
 * against the dev DB:
 *  (a) ensurePartReference creates a reference with fitments; a second call is
 *      an idempotent no-op that does NOT overwrite the existing name
 *  (b) service articles (ПОДЗАКАЗ-*) return null — never enter the reference
 *  (c) the NEW_PART-equivalent transaction (supplier order) yields a draft Part
 *      already linked to the reference (referenceId set)
 *  (d) EstimateLine.referenceId FK exists and the partId-backfill left no gaps
 * Cleans up after itself.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY, defaultWarehouseId } from "../lib/wms-host";
import { ensurePartReference, resolveGenerationIds } from "../lib/part-reference-lookup";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
}

const ARTICLE = "TESTNMTH001";

async function cleanup(): Promise<void> {
  const part = (await db.part.findUnique({ where: { article: ARTICLE }, select: { id: true } })) as {
    id: string;
  } | null;
  if (part) {
    await db.stockItem.deleteMany({ where: { partId: part.id } });
    await db.part.delete({ where: { id: part.id } });
  }
  await db.partReference.deleteMany({ where: { oem: ARTICLE } });
}

async function main(): Promise<void> {
  await cleanup();

  // (a) create + idempotent re-run
  const { ids: genIds, unknown } = await resolveGenerationIds(["W463"]);
  assert(genIds.length === 1 && unknown.length === 0, "resolveGenerationIds знает W463");
  const refId = await ensurePartReference(db, {
    article: ARTICLE,
    name: "Тестовая позиция нити",
    groupName: "Тест",
    generationIds: genIds,
  });
  assert(refId !== null, "ensurePartReference вернул id для нового артикула");
  const again = await ensurePartReference(db, {
    article: ` ${ARTICLE.toLowerCase()} `,
    name: "ДРУГОЕ имя — не должно перезаписаться",
  });
  assert(again === refId, "повторный вызов идемпотентен (тот же id, нормализация работает)");
  const ref = (await db.partReference.findUnique({
    where: { id: refId as string },
    select: { name: true, fitments: { select: { generation: { select: { code: true } } } } },
  })) as { name: string; fitments: Array<{ generation: { code: string } }> };
  assert(ref.name === "Тестовая позиция нити", "существующее название не перетёрто");
  assert(ref.fitments.map((f) => f.generation.code).join(",") === "W463", "fitment W463 создан");

  // (b) service code
  const svc = await ensurePartReference(db, { article: "ПОДЗАКАЗ-99", name: "Служебная" });
  assert(svc === null, "служебный код в справочник не попадает");

  // (c) NEW_PART-equivalent draft part creation (same statements as resolveLinesAndCost)
  await db.$transaction(async (tx) => {
    const referenceId = await ensurePartReference(tx, { article: ARTICLE, name: "Тестовая позиция нити" });
    const part = (await tx.part.create({
      data: { slug: "test-nmth-001", article: ARTICLE, name: "Тестовая позиция нити", price: 0, isActive: false, referenceId },
      select: { id: true },
    })) as { id: string };
    await tx.stockItem.create({
      data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId: await defaultWarehouseId(tx) },
    });
  });
  const draft = (await db.part.findUnique({
    where: { article: ARTICLE },
    select: { referenceId: true, isActive: true, price: true },
  })) as { referenceId: string | null; isActive: boolean; price: number };
  assert(draft.referenceId === refId, "draft-Part (NEW_PART) создан со связью с номенклатурой");
  assert(!draft.isActive && draft.price === 0, "draft-Part скрыт из магазина (isActive=false, price=0)");

  // (d) EstimateLine FK + backfill completeness
  const fk = (await db.$queryRaw`
    SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'EstimateLine_referenceId_fkey'`) as Array<{ n: number }>;
  assert(fk[0].n === 1, "FK EstimateLine.referenceId существует");
  const gaps = (await db.$queryRaw`
    SELECT count(*)::int AS n FROM "EstimateLine" el JOIN "Part" p ON p.id = el."partId"
    WHERE p."referenceId" IS NOT NULL AND el."referenceId" IS NULL`) as Array<{ n: number }>;
  assert(gaps[0].n === 0, "бэкфилл строк смет без пропусков");

  await cleanup();
  console.log("\nVERIFIED: nomenclature thread");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
