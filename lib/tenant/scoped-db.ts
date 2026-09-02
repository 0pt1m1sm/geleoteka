import "server-only";

import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant/context";
import { requireTenantId } from "@/lib/tenant";
import { withTenant } from "@/lib/tenant/with-tenant";

/**
 * Клиент базы, суженный до арендатора.
 *
 * Единственный способ получить данные так, чтобы условие по арендатору не
 * зависело от памяти автора запроса. Разница с обычным `db` одна и важная:
 * забыть здесь нечего.
 *
 * Арендатор берётся из контекста запроса, а если его нет — из установки.
 * Пока сервис один, второй путь и есть обычный; когда появится второй,
 * отсутствие контекста станет ошибкой, и менять придётся одну эту функцию.
 *
 * Клиент кэшируется на арендатора: расширение Prisma создаёт новый объект на
 * каждый вызов, а плодить их на каждый запрос незачем.
 */
/**
 * Клиент базы, суженный до арендатора, — как тип.
 *
 * Модулям, объявляющим «сюда передают клиент базы», раньше приходилось писать
 * `typeof db`, и ради одного типа они тянули прямой клиент. Здесь тот же тип,
 * но из шва: импорт прямого клиента ради типа больше не нужен.
 */
export type TenantDb = Awaited<ReturnType<typeof tenantDb>>;

const cache = new Map<string, typeof db>();

export async function tenantDb(): Promise<typeof db> {
  // Приведение к читателю — та же практика, что везде с Prisma-клиентом:
  // типы теряются через синглтон (.claude/rules/geleoteka-conventions.md).
  const tenantId = currentTenantId() ?? (await requireTenantId(db as unknown as Parameters<typeof requireTenantId>[0]));
  const hit = cache.get(tenantId);
  if (hit) return hit;
  const scoped = withTenant(db, tenantId);
  cache.set(tenantId, scoped);
  return scoped;
}

/** Сбросить кэш клиентов — нужен тестам и смене арендатора установки. */
export function invalidateScopedDbCache(): void {
  cache.clear();
}
