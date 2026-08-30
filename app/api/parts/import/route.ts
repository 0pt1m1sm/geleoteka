import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { newPartSku } from "@/lib/part-sku";
import { SERVICE_ARTICLE_RE, extractModelCodes, normalizeOem } from "@/lib/part-reference";
import { slugify } from "@/lib/slug";
import { defaultWarehouseId } from "@/lib/wms-host";
import { resolveGenerationIds } from "@/lib/part-reference-lookup";

/**
 * Resolves a CSV "compatible models" cell to a set of trim ids. Each token can
 * be either:
 *   "<Model> <GenerationCode>"  → one trim id (the generation's default).
 *   "<Model>"                   → one trim id per active generation under the
 *                                 model (each generation's default trim).
 * Unknown tokens are silently skipped — CSV import is non-interactive, so a
 * permissive parse beats hard-failing the row. The admin form rejects the same
 * shapes explicitly because it can show errors.
 */
async function expandToTrimIds(values: string[]): Promise<string[]> {
  const out = new Set<string>();
  if (values.length === 0) return [];

  // Pre-load active models with generations and default trim ids.
  const models = (await db.vehicleModel.findMany({
    where: { isActive: true },
    select: {
      name: true,
      generations: {
        where: { isActive: true },
        select: {
          code: true,
          trims: {
            where: { isDefault: true },
            select: { id: true },
          },
        },
      },
    },
  })) as Array<{
    name: string;
    generations: Array<{ code: string; trims: Array<{ id: string }> }>;
  }>;

  // Build lookup maps: name → generations[], "name|code" → defaultTrimId
  const byModel = new Map<string, string[]>();
  const byPair = new Map<string, string>();
  for (const m of models) {
    const ids: string[] = [];
    for (const g of m.generations) {
      const defaultId = g.trims[0]?.id;
      if (!defaultId) continue;
      ids.push(defaultId);
      byPair.set(`${m.name}|${g.code}`, defaultId);
    }
    byModel.set(m.name, ids);
  }

  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.includes(" ")) {
      const lastSpace = trimmed.lastIndexOf(" ");
      const modelName = trimmed.slice(0, lastSpace).trim();
      const genCode = trimmed.slice(lastSpace + 1).trim();
      const id = byPair.get(`${modelName}|${genCode}`);
      if (id) out.add(id);
      continue;
    }
    const ids = byModel.get(trimmed);
    if (ids) for (const id of ids) out.add(id);
  }
  return Array.from(out);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    return NextResponse.json({ error: "Файл пустой или содержит только заголовок" }, { status: 400 });
  }

  // Skip header row
  const dataLines = lines.slice(1);
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  // Успешно заведённые артикулы дозаполняют номенклатурный справочник
  // (см. lib/part-reference.ts) одним createMany после цикла; применяемость
  // (fitments) — объединение тримов строки и кодов кузова из текста.
  const refRows: Array<{
    oem: string;
    name: string;
    groupName: string | null;
    generationIds: string[];
  }> = [];

  // Pre-fetch categories for lookup
  const categories = await db.partCategory.findMany();
  const catMap = new Map((categories as Array<Record<string, unknown>>).map((c) => [c.slug as string, c.id as string]));
  const catNameById = new Map(
    (categories as Array<Record<string, unknown>>).map((c) => [c.id as string, c.name as string]),
  );

  for (let i = 0; i < dataLines.length; i++) {
    const lineNum = i + 2; // 1-indexed, skip header
    const cols = dataLines[i].split(";").map((c) => c.trim());

    if (cols.length < 5) {
      errors.push(`Строка ${lineNum}: недостаточно колонок (${cols.length}, нужно минимум 5)`);
      continue;
    }

    const [article, name, description, priceStr, quantityStr, oemStr, categorySlug, modelsStr] = cols;

    if (!article || !name) {
      errors.push(`Строка ${lineNum}: артикул и название обязательны`);
      continue;
    }

    const price = parseInt(priceStr);
    if (isNaN(price) || price <= 0) {
      errors.push(`Строка ${lineNum}: некорректная цена "${priceStr}"`);
      continue;
    }

    // An empty quantity cell defaults to 0, but a negative or non-numeric value
    // must fail the row rather than silently writing bad stock on-hand.
    const quantity = quantityStr ? parseInt(quantityStr, 10) : 0;
    if (isNaN(quantity) || quantity < 0) {
      errors.push(`Строка ${lineNum}: некорректное количество "${quantityStr}"`);
      continue;
    }
    const isOEM = oemStr === "1";
    const categoryId = categorySlug ? (catMap.get(categorySlug) ?? null) : null;
    const trimIds = await expandToTrimIds(
      modelsStr ? modelsStr.split(",").map((m) => m.trim()).filter(Boolean) : [],
    );
    const slug = slugify(`${article}-${name}`).slice(0, 80);

    try {
      // Импорт прайса ведёт НОВЫЕ товары. Ищем по article + condition, а не по
      // sku: артикул больше не уникален, а sku у старых строк залит дословно и
      // с нормализованным ключом не совпадает — по нему повторный залив того
      // же прайса не нашёл бы 15 из 70 позиций и продублировал бы их.
      // Б/у экземпляры импорт не трогает: они не NEW.
      // Внутри try: артикул, пустой после нормализации («---», разделитель в
      // CSV), уронил бы newPartSku и весь обработчик, минуя построчный отчёт.
      if (!normalizeOem(article)) {
        errors.push(`Строка ${lineNum}: артикул должен содержать буквы или цифры`);
        continue;
      }
      const sku = newPartSku(article);

      // Оба ключа: article — потому что sku у старых строк залит дословно,
      // sku — потому что на нём стоит уникальный индекс (см. parts.ts).
      const existing = (await db.part.findFirst({
        where: { OR: [{ article, condition: "NEW" }, { sku }] },
        select: { id: true },
      })) as { id: string } | null;

      if (existing) {
        await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
          await tx.part.update({
            where: { id: existing.id },
            data: { name, description: description || null, price, isOEM, categoryId },
          });
          // CSV import is an authoritative stock load — set the StockItem on-hand directly.
          await tx.stockItem.upsert({
            where: { partId_warehouseId: { partId: existing.id, warehouseId: await defaultWarehouseId(tx) } },
            update: { quantity },
            create: { partId: existing.id, quantity, tenantKey: "geleoteka", warehouseId: await defaultWarehouseId(tx) },
          });
          await tx.partTrim.deleteMany({ where: { partId: existing.id } });
          if (trimIds.length > 0) {
            await tx.partTrim.createMany({
              data: trimIds.map((trimId) => ({ partId: existing.id, trimId })),
              skipDuplicates: true,
            });
          }
        });
        updated++;
      } else {
        // Create the part and its StockItem atomically — otherwise a failure
        // after part.create leaves a part with no stock row.
        await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
          const created_ = (await tx.part.create({
            data: {
              slug,
              article,
              sku,
              name,
              description: description || null,
              price,
              isOEM,
              categoryId,
              photos: [],
              partTrims: { create: trimIds.map((trimId) => ({ trimId })) },
            },
            select: { id: true },
          })) as { id: string };
          await tx.stockItem.create({
            data: { partId: created_.id, quantity, tenantKey: "geleoteka", warehouseId: await defaultWarehouseId(tx) },
          });
        });
        created++;
      }
      if (!SERVICE_ARTICLE_RE.test(article)) {
        const oem = normalizeOem(article);
        if (oem) {
          const trimGens = trimIds.length
            ? ((await db.vehicleTrim.findMany({
                where: { id: { in: trimIds } },
                select: { generationId: true },
              })) as Array<{ generationId: string }>)
            : [];
          const { ids: textGenIds } = await resolveGenerationIds(
            extractModelCodes(`${name} ${description ?? ""}`),
          );
          refRows.push({
            oem,
            name,
            groupName: categoryId ? catNameById.get(categoryId) ?? null : null,
            generationIds: [
              ...new Set([...trimGens.map((t) => t.generationId), ...textGenIds]),
            ],
          });
        }
      }
    } catch (err) {
      // P2002 здесь означает, что артикул строки нормализуется в уже занятый
      // sku (та же деталь, записанная с другой пунктуацией). Сырой текст
      // Prisma «Unique constraint failed on the fields: (`sku`)» в отчёте о
      // заливке прайса нечитаем.
      const isDup =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      errors.push(
        isDup
          ? `Строка ${lineNum}: артикул ${article} уже есть в каталоге под другой записью номера`
          : `Строка ${lineNum}: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
      );
    }
  }

  if (refRows.length > 0) {
    await db.partReference.createMany({
      data: refRows.map((r) => ({
        oem: r.oem,
        name: r.name,
        groupName: r.groupName,
        source: "shop",
      })),
      skipDuplicates: true,
    });
    const refIds = (await db.partReference.findMany({
      where: { oem: { in: refRows.map((r) => r.oem) } },
      select: { id: true, oem: true },
    })) as Array<{ id: string; oem: string }>;
    const idByOem = new Map(refIds.map((r) => [r.oem, r.id]));
    const fitmentRows = refRows.flatMap((r) => {
      const referenceId = idByOem.get(r.oem);
      if (!referenceId) return [];
      return r.generationIds.map((generationId) => ({ referenceId, generationId }));
    });
    if (fitmentRows.length > 0) {
      await db.partReferenceFitment.createMany({ data: fitmentRows, skipDuplicates: true });
    }
    // Связь товар → номенклатура для только что заведённых строк: один
    // идемпотентный проход по нормализованному артикулу (как в миграции).
    await db.$executeRaw`
      UPDATE "Part" p
      SET "referenceId" = r.id
      FROM "PartReference" r
      WHERE p."referenceId" IS NULL
        AND upper(regexp_replace(p.article, '[^A-Za-z0-9А-Яа-яЁё]', '', 'g')) = r.oem`;
  }

  return NextResponse.json({ created, updated, errors });
}
