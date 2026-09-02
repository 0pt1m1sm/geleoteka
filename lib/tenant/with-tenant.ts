import "server-only";

import { MODEL_CLASSIFICATION } from "@/lib/tenant/model-classification";
import { scopeQuery } from "@/lib/tenant/scope";

/**
 * Шов изоляции: клиент базы, который видит данные только одного арендатора.
 *
 * Обёртка намеренно тонкая — вся логика в `scope.ts`, здесь только подключение
 * к Prisma. Расширение перехватывает КАЖДУЮ операцию каждой модели, поэтому
 * забыть условие по арендатору в отдельном запросе больше нельзя: условие
 * добавляется не автором запроса, а швом.
 *
 * Это первый из двух контуров. Второй — RLS на стороне базы (Story 7): шов
 * защищает от забывчивости, RLS — от обхода шва. Ни один из них не заменяет
 * другой: код может пойти мимо шва, а политика базы не знает, что «свой»
 * арендатор у этого запроса именно такой.
 */

/** Имена моделей, у которых есть колонка арендатора. */
const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.entries(MODEL_CLASSIFICATION)
    .filter(([, e]) => e.kind === "TENANT" || e.kind === "TENANT_CHILD")
    .map(([name]) => name),
);

/**
 * Клиент со швом возвращается ТЕМ ЖЕ типом, что и пришёл: вызывающий код
 * продолжает видеть обычный Prisma-клиент со всеми моделями. Приведение типа
 * внутри — та же практика, что и везде в проекте с Prisma-клиентом (см.
 * .claude/rules/geleoteka-conventions.md): сигнатура `$extends` слишком
 * подвижна, чтобы описывать её структурно.
 */
export function withTenant<T>(client: T, tenantId: string): T {
  if (!tenantId) {
    throw new Error("withTenant вызван без арендатора: запрос без него читал бы всю базу");
  }
  return (client as { $extends: (extension: unknown) => unknown }).$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: Record<string, unknown>;
          query: (args: Record<string, unknown>) => Promise<unknown>;
        }) {
          const scoped = scopeQuery({
            model,
            operation,
            args: args ?? {},
            tenantId,
            tenantModels: TENANT_MODELS,
          });
          return query(scoped.args);
        },
      },
    },
  }) as T;
}
