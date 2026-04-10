import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
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
    const compatibleModels = modelsStr ? modelsStr.split(",").map((m) => m.trim()).filter(Boolean) : [];
    const slug = slugify(`${article}-${name}`).slice(0, 80);

    try {
      const existing = await db.part.findUnique({ where: { article } });

      if (existing) {
        await db.part.update({
          where: { article },
          data: { name, description: description || null, price, quantity, isOEM, categoryId, compatibleModels },
        });
        updated++;
      } else {
        await db.part.create({
          data: { slug, article, name, description: description || null, price, quantity, isOEM, categoryId, compatibleModels, photos: [] },
        });
        created++;
      }
    } catch (err) {
      errors.push(`Строка ${lineNum}: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
    }
  }

  return NextResponse.json({ created, updated, errors });
}
