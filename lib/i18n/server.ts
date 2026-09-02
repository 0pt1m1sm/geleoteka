import "server-only";

import type { LocaleSettings } from "@/lib/i18n/format";
import { resolveTenant, type TenantReader } from "@/lib/tenant";
import { tenantDb } from "@/lib/tenant/scoped-db";

/**
 * Региональные настройки арендатора этой установки.
 *
 * Читается через шов, хотя речь об арендаторе: `Tenant` — глобальная запись
 * реестра, а не данные арендатора, и шов такие модели не трогает вовсе
 * (`lib/tenant/scope.ts`: сужаются только модели с колонкой арендатора).
 * Поэтому исключение для прямого клиента здесь не нужно.
 *
 * Значения на случай недокатанной миграции — те же, по которым код работал до
 * появления полей. Падать здесь нельзя: форматирование цены не та операция,
 * ради которой стоит ронять страницу.
 */
const FALLBACK: LocaleSettings = {
  locale: "ru-RU",
  currency: "RUB",
  timeZone: "Europe/Moscow",
};

export async function tenantLocale(): Promise<LocaleSettings> {
  const db = await tenantDb();
  const tenant = await resolveTenant(db as unknown as TenantReader);
  if (!tenant) return FALLBACK;
  return {
    locale: tenant.locale,
    currency: tenant.currency,
    timeZone: tenant.timeZone,
  };
}
