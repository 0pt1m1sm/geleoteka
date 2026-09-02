import "server-only";

import { DEFAULT_LOCALE_SETTINGS, type LocaleSettings } from "@/lib/i18n/format";
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
const FALLBACK: LocaleSettings = DEFAULT_LOCALE_SETTINGS;

export async function tenantLocale(): Promise<LocaleSettings> {
  // Ошибка здесь не должна ронять страницу — ни одну.
  //
  // Первая редакция ловила только «строки нет» и падала на всём остальном:
  // недоступная база, незаданный DATABASE_URL. Этого хватило, чтобы уронить
  // боевую СБОРКУ 02.09: корневая разметка спрашивает настройки на каждой
  // странице, базы в окружении сборки нет, и предрендер админской страницы
  // умер вместе со всем выкатом.
  //
  // Настройки формата — не то, ради чего стоит терять страницу: без них цена
  // и дата покажутся так, как показывались до появления полей.
  try {
    const db = await tenantDb();
    const tenant = await resolveTenant(db as unknown as TenantReader);
    if (!tenant) return FALLBACK;
    return {
      locale: tenant.locale,
      currency: tenant.currency,
      timeZone: tenant.timeZone,
    };
  } catch {
    return FALLBACK;
  }
}
