"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  normalizeOem,
  parseReferenceCsv,
  SERVICE_ARTICLE_RE,
} from "@/lib/part-reference";
import { resolveGenerationIds } from "@/lib/part-reference-lookup";

const REFS_PATH = "/admin/parts/refs";

export interface PartReferenceOption {
  id: string;
  oem: string;
  name: string;
  groupName: string | null;
  /** Коды кузовов из fitments — для отображения в пикерах. */
  models: string[];
  /** id товара магазина с тем же артикулом, если он уже заведён. */
  /** Id НОВОГО товара по этой номенклатуре, если он есть. */
  shopPartId: string | null;
  /** Есть ли по номенклатуре хоть какой-то товар, включая б/у экземпляры.
   *  Отдельный флаг: «нового нет» и «в магазине ничего нет» — разные факты,
   *  и потребители делают из них разные выводы. */
  hasAnyPart: boolean;
}

interface RefWithFitments {
  id: string;
  oem: string;
  name: string;
  groupName: string | null;
  fitments: Array<{ generation: { code: string } }>;
  parts: Array<{ id: string }>;
  _count: { parts: number };
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
    select: {
      id: true,
      oem: true,
      name: true,
      groupName: true,
      fitments: { select: { generation: { select: { code: true } } } },
      // Только НОВЫЙ товар: б/у экземпляр не означает, что номенклатура
      // «уже в магазине». Без фильтра первый же б/у экземпляр помечал бы
      // позицию занятой, и PartRefPicker заблокировал бы создание нового
      // товара из неё — то есть фича вариантов ломала бы саму себя.
      // orderBy обязателен: без него выбор строки произволен.
      parts: {
        where: { condition: "NEW" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
      // Отдельным счётчиком — есть ли ХОТЬ КАКОЙ-ТО товар. Смета обязана
      // отличать «нового нет» от «в магазине ничего нет»: номенклатура, у
      // которой лежит только б/у экземпляр, иначе попадала бы в раздел
      // «под заказ», менеджер добавлял бы строку без partId, и физический
      // экземпляр уехал бы без резерва — то есть мог бы продаться дважды.
      _count: { select: { parts: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  })) as RefWithFitments[];

  return refs.map((r) => ({
    id: r.id,
    oem: r.oem,
    name: r.name,
    groupName: r.groupName,
    models: r.fitments.map((f) => f.generation.code).sort(),
    shopPartId: r.parts[0]?.id ?? null,
    hasAnyPart: r._count.parts > 0,
  }));
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

  const codes = modelsRaw
    ? modelsRaw.split(",").map((m) => m.trim()).filter(Boolean)
    : [];
  const { ids: generationIds, unknown } = await resolveGenerationIds(codes);
  if (unknown.length > 0) {
    return {
      error: `Кузовов нет в каталоге: ${unknown.join(", ")}. Добавьте их в «Модели и поколения» или уберите из списка`,
    };
  }

  const fitmentRows = generationIds.map((generationId) => ({ generationId }));
  await db.partReference.upsert({
    where: { oem },
    create: {
      oem,
      name,
      groupName,
      source: "manual",
      fitments: { create: fitmentRows },
    },
    update: {
      name,
      groupName,
      fitments: { deleteMany: {}, create: fitmentRows },
    },
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
 * Коды кузова резолвятся в каталог; неизвестные пропускаются с предупреждением.
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

  // Один резолв на весь батч: собрать все коды, спросить каталог один раз.
  const allCodes = [...new Set(rows.flatMap((r) => r.models.map((c) => c.toUpperCase())))];
  const resolvedByCode = new Map<string, string>();
  const unknownCodes = new Set<string>();
  for (const code of allCodes) {
    const { ids, unknown } = await resolveGenerationIds([code]);
    if (ids.length > 0) resolvedByCode.set(code, ids[0]);
    for (const u of unknown) unknownCodes.add(u);
  }
  if (unknownCodes.size > 0) {
    errors.push(
      `Кузовов нет в каталоге, применяемость пропущена: ${[...unknownCodes].join(", ")}`,
    );
  }

  const res = await db.partReference.createMany({
    data: rows.map((r) => ({
      oem: r.oem,
      name: r.name,
      groupName: r.groupName,
      source: "import",
    })),
    skipDuplicates: true,
  });

  // Применяемость — вторым проходом по id (createMany не умеет nested).
  // skipDuplicates дозаполняет и уже существовавшие позиции.
  const refIds = (await db.partReference.findMany({
    where: { oem: { in: rows.map((r) => r.oem) } },
    select: { id: true, oem: true },
  })) as Array<{ id: string; oem: string }>;
  const idByOem = new Map(refIds.map((r) => [r.oem, r.id]));
  const fitmentRows = rows.flatMap((r) => {
    const referenceId = idByOem.get(r.oem);
    if (!referenceId) return [];
    return r.models
      .map((c) => resolvedByCode.get(c.toUpperCase()))
      .filter((v): v is string => Boolean(v))
      .map((generationId) => ({ referenceId, generationId }));
  });
  if (fitmentRows.length > 0) {
    await db.partReferenceFitment.createMany({ data: fitmentRows, skipDuplicates: true });
  }

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
