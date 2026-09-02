import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Арендатор текущего запроса.
 *
 * Хранилище на асинхронный контекст, а не переменная модуля: сервер
 * обрабатывает запросы разных арендаторов одновременно, и глобальная
 * переменная означала бы, что чужой запрос переписывает твоего арендатора
 * между двумя await. Это не гипотетика, а обычная работа Node под нагрузкой.
 *
 * Пока установка одна, контекст чаще всего пуст, и `tenantDb()` берёт
 * арендатора установки. Когда появится второй сервис, контекст станет
 * обязательным — и место, где это переключается, ровно одно.
 */
const storage = new AsyncLocalStorage<{ tenantId: string }>();

/** Выполнить работу от имени арендатора. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  if (!tenantId) throw new Error("runWithTenant вызван без арендатора");
  return storage.run({ tenantId }, fn);
}

/** Арендатор текущего запроса или null, если контекст не установлен. */
export function currentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}
