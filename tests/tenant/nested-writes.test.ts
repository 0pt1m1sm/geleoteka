import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Вложенные создания и арендатор.
 *
 * Шов проставляет арендатора в данные верхнего уровня. Вложенное создание
 * (`create: { … }` внутри данных родителя) он не трогает — и это осознанно:
 * обходить произвольно вложенные структуры значит писать вторую Prisma.
 *
 * Такие строки защищены НЕ швом, а базой, и защищены жёстче:
 *   1. умолчание колонки проставляет арендатора установки;
 *   2. составной внешний ключ (родитель + арендатор) отвергает строку, если
 *      она оказалась под родителем другого арендатора.
 *
 * То есть ошибка здесь не «тихо чужие данные», а отказ записи. Этот тест
 * сторожит саму опору: пока фаза expand не закончена, умолчание в базе должно
 * существовать. Снимут его раньше времени — вложенные создания начнут падать,
 * и лучше узнать об этом здесь, чем на записи клиента.
 */
describe("опора для вложенных созданий", () => {
  const migration = readFileSync(
    join(process.cwd(), "prisma/migrations/20260902030000_tenant_id_on_roots/migration.sql"),
    "utf8",
  );
  const children = readFileSync(
    join(process.cwd(), "prisma/migrations/20260902040000_tenant_id_on_children/migration.sql"),
    "utf8",
  );

  it("умолчание арендатора задано у корневых таблиц", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS \"tenantId\" TEXT DEFAULT 'tenant_geleoteka'");
  });

  it("умолчание задано и у дочерних", () => {
    expect(children).toContain("ADD COLUMN IF NOT EXISTS \"tenantId\" TEXT DEFAULT 'tenant_geleoteka'");
  });

  it("составной ключ ссылается на пару (id, арендатор)", () => {
    // Именно он превращает ошибку в отказ записи, а не в чужие данные.
    expect(children).toMatch(/FOREIGN KEY \("\w+", "tenantId"\) REFERENCES "\w+"\("id", "tenantId"\)/);
  });
});
