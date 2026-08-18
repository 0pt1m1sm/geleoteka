import { db } from "@/lib/db";
import { expandGenerationCodes, normalizeOem, SERVICE_ARTICLE_RE } from "@/lib/part-reference";

/** Транзакционный или глобальный клиент Prisma — хелперам достаточно делегатов моделей. */
type DbLike = typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0];

export interface ResolvedGenerations {
  /** id поколений каталога для найденных кодов (уникальные). */
  ids: string[];
  /** Коды, которых нет в каталоге (в нормализованном виде). */
  unknown: string[];
}

/**
 * Резолвит текстовые коды кузова («W463», «w464») в id поколений каталога
 * (VehicleGeneration). Регистронезависимо; синонимы (W464↔W463A) пробуются,
 * если точного кода в каталоге нет. Неизвестные коды возвращаются отдельно —
 * решение (ошибка или пропуск) за вызывающим.
 */
export interface EnsureReferenceInput {
  article: string;
  name: string;
  groupName?: string | null;
  generationIds?: readonly string[];
}

/**
 * Единая точка захвата в номенклатурный справочник: «артикул + название →
 * id записи справочника». Upsert по нормализованному номеру; существующая
 * запись НЕ перетирается (update: {}). Возвращает null для служебных кодов
 * (ПОДЗАКАЗ-*, VERIFY-*) и артикулов без букв/цифр — такие позиции живут
 * без номенклатурной связи. Используется всеми путями создания товара:
 * форма, CSV-импорт, NEW_PART в заказе поставщику.
 */
export async function ensurePartReference(
  client: DbLike,
  { article, name, groupName, generationIds }: EnsureReferenceInput,
): Promise<string | null> {
  if (SERVICE_ARTICLE_RE.test(article)) return null;
  const oem = normalizeOem(article);
  if (!oem) return null;
  const ref = (await client.partReference.upsert({
    where: { oem },
    create: {
      oem,
      name: name.trim(),
      source: "shop",
      groupName: groupName ?? null,
      fitments: {
        create: (generationIds ?? []).map((generationId) => ({ generationId })),
      },
    },
    update: {},
    select: { id: true },
  })) as { id: string };
  return ref.id;
}

export async function resolveGenerationIds(codes: readonly string[]): Promise<ResolvedGenerations> {
  const normalized = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0) return { ids: [], unknown: [] };

  const candidates = expandGenerationCodes(normalized);
  const gens = (await db.vehicleGeneration.findMany({
    where: { code: { in: candidates, mode: "insensitive" } },
    select: { id: true, code: true },
  })) as Array<{ id: string; code: string }>;
  const byCode = new Map(gens.map((g) => [g.code.toUpperCase(), g]));

  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const code of normalized) {
    const exact = byCode.get(code);
    if (exact) {
      ids.add(exact.id);
      continue;
    }
    const viaAlias = expandGenerationCodes([code])
      .map((c) => byCode.get(c))
      .find(Boolean);
    if (viaAlias) {
      ids.add(viaAlias.id);
    } else {
      unknown.push(code);
    }
  }
  return { ids: [...ids], unknown };
}
