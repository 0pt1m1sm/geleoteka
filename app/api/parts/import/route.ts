import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

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

  // Pre-fetch categories for lookup
  const categories = await db.partCategory.findMany();
  const catMap = new Map((categories as Array<Record<string, unknown>>).map((c) => [c.slug as string, c.id as string]));

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

    const quantity = parseInt(quantityStr) || 0;
    const isOEM = oemStr === "1";
    const categoryId = categorySlug ? (catMap.get(categorySlug) ?? null) : null;
    const trimIds = await expandToTrimIds(
      modelsStr ? modelsStr.split(",").map((m) => m.trim()).filter(Boolean) : [],
    );
    const slug = slugify(`${article}-${name}`).slice(0, 80);

    try {
      const existing = (await db.part.findUnique({ where: { article }, select: { id: true } })) as
        | { id: string }
        | null;

      if (existing) {
        await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
          await tx.part.update({
            where: { article },
            data: { name, description: description || null, price, quantity, isOEM, categoryId },
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
        await db.part.create({
          data: {
            slug,
            article,
            name,
            description: description || null,
            price,
            quantity,
            isOEM,
            categoryId,
            photos: [],
            partTrims: { create: trimIds.map((trimId) => ({ trimId })) },
          },
        });
        created++;
      }
    } catch (err) {
      errors.push(`Строка ${lineNum}: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
    }
  }

  return NextResponse.json({ created, updated, errors });
}
