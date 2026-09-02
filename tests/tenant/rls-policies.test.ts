import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MODEL_CLASSIFICATION } from "@/lib/tenant/model-classification";

/**
 * Сторож политик RLS.
 *
 * Политика, забытая на одной таблице, — это дыра ровно в той таблице, где её
 * не хватает, и заметить её глазами нельзя: остальные семьдесят две работают.
 * Поэтому список берётся из классификации, а не из памяти.
 */
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260902100000_row_level_security/migration.sql"),
  "utf8",
);

function tableNameOf(model: string): string {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const block = schema.match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, "m"));
  const mapped = block?.[1].match(/@@map\("([^"]+)"\)/);
  return mapped ? mapped[1] : model;
}

describe("политики изоляции в базе", () => {
  const owned = Object.entries(MODEL_CLASSIFICATION)
    .filter(([, e]) => e.kind === "TENANT" || e.kind === "TENANT_CHILD")
    .map(([name]) => ({ model: name, table: tableNameOf(name) }));

  it("включены у всех таблиц с арендатором", () => {
    const missing = owned
      .filter(({ table }) => !migration.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`))
      .map((t) => t.model);
    expect(missing, `без RLS: ${missing.join(", ")}`).toEqual([]);
  });

  it("включены ПРИНУДИТЕЛЬНО — иначе владелец таблиц их не заметит", () => {
    // Приложение ходит в базу владельцем всех таблиц, а владельца обычный RLS
    // не касается. Без FORCE политика висела бы, ничего не защищая, и создавала
    // ложное ощущение сделанного.
    const missing = owned
      .filter(({ table }) => !migration.includes(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`))
      .map((t) => t.model);
    expect(missing, `без FORCE: ${missing.join(", ")}`).toEqual([]);
  });

  it("отказ закрытый: незаданный арендатор не открывает доступ", () => {
    // current_setting(..., true) при незаданной настройке даёт NULL, предикат
    // становится NULL, строк нет. Вариант «NULL значит всё видно» был бы
    // тихой утечкой при первой же забытой установке.
    expect(migration).not.toMatch(/current_setting\('app\.tenant_id', true\) IS NULL/);
    expect(migration).toContain(`"tenantId" = current_setting('app.tenant_id', true)`);
  });

  it("запись проверяется наравне с чтением", () => {
    // Без WITH CHECK строку чужому арендатору можно было бы записать, просто
    // не увидев её потом.
    const policies = migration.match(/CREATE POLICY tenant_isolation/g) ?? [];
    const checks = migration.match(/WITH CHECK/g) ?? [];
    expect(checks.length).toBe(policies.length);
  });

  it("лаз для обслуживания явный и один", () => {
    // Миграции с данными и разбор инцидентов идут под явным флагом, который
    // надо написать руками. Скрытых обходов быть не должно.
    const bypasses = migration.match(/current_setting\('app\.rls_bypass', true\) = 'on'/g) ?? [];
    expect(bypasses.length).toBe(((migration.match(/CREATE POLICY/g) ?? []).length) * 2);
  });
});
