/**
 * Правила подмешивания арендатора в запрос — чистой функцией, без Prisma.
 *
 * Шов изоляции строится из двух частей: этих правил и тонкой обёртки над
 * клиентом (`with-tenant.ts`). Разделение намеренное — правила решают всё
 * важное, и проверять их надо тестами, а не живой базой: тест на базе
 * доказывает один случай, тест на правилах — все.
 *
 * Что делают правила:
 *   чтение   — добавляют условие по арендатору;
 *   создание — проставляют арендатора в данные;
 *   изменение и удаление — сужают условие до своего арендатора.
 *
 * Отдельно про `findUnique`. Он тоже получает условие по арендатору: Prisma 6
 * допускает дополнительные фильтры рядом с уникальным полем, и строка чужого
 * арендатора просто не находится. Проверено живым тестом на настоящей базе —
 * первая версия переписывала операцию в `findFirst`, и мутант показал, что
 * переписывание ничего не меняет. Лишний код убран: он вдобавок ходил в клиент
 * мимо расширения и молча пропускал бы остальные расширения.
 */

/** Операции, которые читают и обязаны быть сужены условием. */
const READS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** Операции записи, у которых арендатор проставляется в данные. */
const CREATES = new Set(["create", "createMany", "createManyAndReturn"]);

/** Операции, меняющие существующие строки: сужаем условие. */
const MUTATIONS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

export interface ScopeInput {
  model: string;
  operation: string;
  args: Record<string, unknown>;
  tenantId: string;
  /** Модели, у которых есть колонка арендатора. Остальные не трогаем. */
  tenantModels: ReadonlySet<string>;
}

export interface ScopeResult {
  operation: string;
  args: Record<string, unknown>;
}

function withTenantWhere(where: unknown, tenantId: string): Record<string, unknown> {
  const base = (where && typeof where === "object" ? where : {}) as Record<string, unknown>;
  return { ...base, tenantId };
}

export function scopeQuery(input: ScopeInput): ScopeResult {
  const { model, operation, args, tenantId, tenantModels } = input;
  const untouched: ScopeResult = { operation, args };

  // Общие справочники платформы через шов проходят как есть: колонки
  // арендатора у них нет, и условие по ней было бы ошибкой запроса.
  if (!tenantModels.has(model)) return untouched;

  if (READS.has(operation) || MUTATIONS.has(operation)) {
    const next: Record<string, unknown> = { ...args, where: withTenantWhere(args.where, tenantId) };
    // upsert создаёт строку, если не нашёл: арендатор нужен и в данных.
    if (operation === "upsert" && next.create && typeof next.create === "object") {
      next.create = { ...(next.create as Record<string, unknown>), tenantId };
    }
    return { operation, args: next };
  }

  if (CREATES.has(operation)) {
    const data = args.data;
    if (Array.isArray(data)) {
      return { operation, args: { ...args, data: data.map((row) => ({ ...(row as object), tenantId })) } };
    }
    if (data && typeof data === "object") {
      return { operation, args: { ...args, data: { ...(data as object), tenantId } } };
    }
    return untouched;
  }

  return untouched;
}
