/**
 * Арендатор, которого обслуживает эта установка.
 *
 * Раньше здесь была одна константа. Теперь есть таблица `Tenant`, и константа
 * осталась ключом установки по умолчанию — тем самым, что стоит значением по
 * умолчанию у колонок `tenantKey` и в конфиге. Убирать её рано: на неё
 * опирается около четырёхсот мест, и замена их разом ничего бы не проверила,
 * зато сломала бы всё сразу.
 *
 * Разделение намеренное:
 *   `TENANT_KEY`        — компиляционная константа, ключ установки.
 *   `resolveTenant()`   — строка из базы: идентификатор, название, статус.
 *
 * Идентификатор (`id`) — то, на что будут ссылаться связи в следующих
 * историях; ключ (`key`) остаётся человекочитаемым для конфига и логов, чтобы
 * переименование сервиса не означало миграцию всех таблиц.
 *
 * План: docs/plans/2026-09-02-multi-tenant-p1.md
 */

export const TENANT_KEY = "geleoteka";

export interface TenantRecord {
  id: string;
  key: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  /** ISO 3166-1 alpha-2 — разбор телефона, форма адреса, налоги, провайдеры. */
  country: string;
  /** ISO 4217. Сколько у валюты минорных единиц — вопрос к коду, а не к сотне. */
  currency: string;
  /** BCP 47 — язык и региональные форматы. */
  locale: string;
  /** IANA — часы на стене в сервисе. */
  timeZone: string;
}

/** Минимум от клиента базы, нужный резолверу — чтобы тест не тянул Prisma. */
export interface TenantReader {
  tenant: { findUnique: (args: unknown) => Promise<unknown> };
}

/**
 * Кэш на процесс. Строка арендатора меняется раз в жизни установки, а читается
 * на каждом запросе; поход в базу за одним и тем же значением был бы лишним.
 * Инвалидируется только явно — чтобы тесты и смена статуса не залипали.
 */
let cached: TenantRecord | null = null;

export function invalidateTenantCache(): void {
  cached = null;
}

/**
 * Прочитать арендатора установки. `null`, если строки нет — такое возможно
 * только на базе, где миграция не накатилась, и молчать об этом нельзя:
 * вызывающий обязан решить сам, падать или работать по-старому.
 */
export async function resolveTenant(
  client: TenantReader,
  key: string = TENANT_KEY,
): Promise<TenantRecord | null> {
  if (cached && cached.key === key) return cached;
  const row = (await client.tenant.findUnique({
    where: { key },
    select: {
      id: true,
      key: true,
      name: true,
      status: true,
      country: true,
      currency: true,
      locale: true,
      timeZone: true,
    },
  })) as TenantRecord | null;
  if (row) cached = row;
  return row;
}

/**
 * Идентификатор арендатора установки. Бросает, если строки нет: это не
 * восстановимая ситуация, а признак недокатанной миграции, и тихо подставить
 * что-то вместо него значило бы записать данные в никуда.
 */
export async function requireTenantId(
  client: TenantReader,
  key: string = TENANT_KEY,
): Promise<string> {
  const tenant = await resolveTenant(client, key);
  if (!tenant) {
    throw new Error(
      `Арендатор «${key}» не найден в таблице Tenant. Миграция 20260902020000_tenant_table не накатилась?`,
    );
  }
  return tenant.id;
}
