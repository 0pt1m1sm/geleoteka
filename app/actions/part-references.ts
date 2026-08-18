"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  normalizeOem,
  parseReferenceCsv,
  SERVICE_ARTICLE_RE,
} from "@/lib/part-reference";

const REFS_PATH = "/admin/parts/refs";

export interface PartReferenceOption {
  id: string;
  oem: string;
  name: string;
  groupName: string | null;
  models: string[];
  /** id товара магазина с тем же артикулом, если он уже заведён. */
  shopPartId: string | null;
}

/**
 * Датасорс автокомплита по справочнику (пикер в смете, форма товара).
 * Ищет по нормализованному номеру и названию, отдаёт связку с товаром
 * магазина (soft join Part.article = oem), чтобы UI показывал «уже в магазине».
 */
export async function searchPartReferences(query: string): Promise<PartReferenceOption[]> {
  await requireRole(["ADMIN", "MANAGER"]);
  const q = query.trim();
  const qOem = normalizeOem(q);

  const refs = (await db.partReference.findMany({
    where: q
      ? {
          OR: [
            ...(qOem ? [{ oem: { contains: qOem, mode: "insensitive" as const } }] : []),
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {},
    select: { id: true, oem: true, name: true, groupName: true, models: true },
    orderBy: { name: "asc" },
    take: 20,
  })) as Array<{
    id: string;
    oem: string;
    name: string;
    groupName: string | null;
    models: string[];
  }>;

  if (refs.length === 0) return [];

  const parts = (await db.part.findMany({
    where: { article: { in: refs.map((r) => r.oem) } },
    select: { id: true, article: true },
  })) as Array<{ id: string; article: string }>;
  const byArticle = new Map(parts.map((p) => [p.article, p.id]));

  return refs.map((r) => ({ ...r, shopPartId: byArticle.get(r.oem) ?? null }));
}

export async function createPartReference(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null; success?: boolean }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const oemRaw = ((formData.get("oem") as string | null) ?? "").trim();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const groupName = ((formData.get("groupName") as string | null) ?? "").trim() || null;
  const modelsRaw = ((formData.get("models") as string | null) ?? "").trim();

  const oem = normalizeOem(oemRaw);
  if (!oem || !name) return { error: "Номер и название обязательны" };
  if (SERVICE_ARTICLE_RE.test(oemRaw)) {
    return { error: "Служебные коды (ПОДЗАКАЗ-*, VERIFY-*) в справочник не заводятся" };
  }
  const models = modelsRaw
    ? modelsRaw.split(",").map((m) => m.trim()).filter(Boolean)
    : [];

  await db.partReference.upsert({
    where: { oem },
    create: { oem, name, groupName, models, source: "manual" },
    update: { name, groupName, models },
  });

  revalidatePath(REFS_PATH);
  return { error: null, success: true };
}

export interface ImportReferencesState {
  error: string | null;
  created?: number;
  skipped?: number;
  lineErrors?: string[];
}

/**
 * Массовый импорт справочника из вставленного текста (прайс поставщика,
 * выгрузка EPC/1С). Существующие номера не перетираются — импорт только
 * дозаполняет (skipDuplicates), чтобы не затереть выверенные вручную названия.
 */
export async function importPartReferencesCsv(
  _prevState: ImportReferencesState | null,
  formData: FormData,
): Promise<ImportReferencesState> {
  await requireRole(["ADMIN", "MANAGER"]);

  const text = ((formData.get("csv") as string | null) ?? "").trim();
  if (!text) return { error: "Вставьте строки для импорта" };

  const { rows, errors } = parseReferenceCsv(text);
  if (rows.length === 0) {
    return { error: "Не найдено ни одной корректной строки", lineErrors: errors };
  }

  const res = await db.partReference.createMany({
    data: rows.map((r) => ({
      oem: r.oem,
      name: r.name,
      groupName: r.groupName,
      models: r.models,
      source: "import",
    })),
    skipDuplicates: true,
  });

  revalidatePath(REFS_PATH);
  return {
    error: null,
    created: res.count,
    skipped: rows.length - res.count,
    lineErrors: errors,
  };
}

export async function deletePartReference(id: string): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.partReference.delete({ where: { id } });
  } catch {
    return { error: "Позиция не найдена" };
  }
  revalidatePath(REFS_PATH);
  return { error: null };
}
