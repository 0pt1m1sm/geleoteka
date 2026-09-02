import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MODEL_CLASSIFICATION } from "@/lib/tenant/model-classification";

/**
 * Сторож колонки арендатора.
 *
 * Классификация говорит, чья таблица; этот сторож требует, чтобы у корневых
 * таблиц колонка действительно была, а у общих справочников её не было. Без
 * него классификация осталась бы декларацией: модель объявлена TENANT, колонки
 * нет, и данные сервиса лежат общей кучей.
 */
function modelBlocks(): Map<string, string> {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const blocks = new Map<string, string>();
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    blocks.set(m[1], m[2]);
  }
  return blocks;
}

const hasTenantId = (body: string): boolean => /^\s+tenantId\s/m.test(body);

/**
 * Арендатор входит в первичный ключ модели.
 *
 * Для таких таблиц два правила ниже не действуют, и это не послабление:
 * первичный ключ и индексирует колонку, и делает её обязательной. Требовать
 * сверх него отдельный индекс — это второй индекс по тем же данным, а
 * «необязательность как признак фазы expand» к таблице, заведённой уже
 * мультиарендной, просто не относится.
 */
const tenantInPrimaryKey = (body: string): boolean => /@@id\(\[tenantId[,\]]/.test(body);

describe("колонка арендатора в схеме", () => {
  const blocks = modelBlocks();

  it("у каждой дочерней строки тоже есть tenantId", () => {
    // Колонка у ребёнка — половина защиты; вторая половина, составной внешний
    // ключ, без неё невозможна.
    const missing = Object.entries(MODEL_CLASSIFICATION)
      .filter(([, e]) => e.kind === "TENANT_CHILD")
      .map(([name]) => name)
      .filter((name) => !hasTenantId(blocks.get(name) ?? ""));
    expect(missing, `без tenantId: ${missing.join(", ")}`).toEqual([]);
  });

  it("у каждой корневой сущности сервиса есть tenantId", () => {
    const missing = Object.entries(MODEL_CLASSIFICATION)
      .filter(([, e]) => e.kind === "TENANT")
      .map(([name]) => name)
      .filter((name) => !hasTenantId(blocks.get(name) ?? ""));
    expect(missing, `без tenantId: ${missing.join(", ")}`).toEqual([]);
  });

  it("у общих справочников платформы tenantId нет", () => {
    // Колонка арендатора на VehicleGeneration означала бы, что каждый сервис
    // заводит свой Мерседес заново.
    const wrong = Object.entries(MODEL_CLASSIFICATION)
      .filter(([, e]) => e.kind === "GLOBAL")
      .map(([name]) => name)
      .filter((name) => hasTenantId(blocks.get(name) ?? ""));
    expect(wrong, `лишний tenantId: ${wrong.join(", ")}`).toEqual([]);
  });

  it("каждая колонка арендатора проиндексирована", () => {
    // Без индекса первый же запрос с фильтром по арендатору читает всю
    // таблицу — на общей базе это чужие строки в буфере и лишняя нагрузка.
    const unindexed = [...blocks.entries()]
      .filter(([, body]) => hasTenantId(body) && !tenantInPrimaryKey(body))
      .filter(([, body]) => !/@@index\(\[tenantId\]\)/.test(body))
      .map(([name]) => name);
    expect(unindexed, `без индекса: ${unindexed.join(", ")}`).toEqual([]);
  });

  it("колонка объявлена необязательной — это фаза expand", () => {
    // Обязательной она станет, когда все записи будут проставлять её явно.
    // Сделать её NOT NULL сейчас значит уронить прод на первой же записи.
    const required = [...blocks.entries()]
      .filter(([, body]) => /^\s+tenantId\s+String\s/m.test(body) && !tenantInPrimaryKey(body))
      .map(([name]) => name);
    expect(required, `уже обязательные: ${required.join(", ")}`).toEqual([]);
  });
});

/**
 * Сторож на имена таблиц в миграции.
 *
 * Модель и таблица — не одно и то же: `PartShipment` живёт в таблице
 * `PartOrder` (@@map). Первая версия миграции обращалась к имени модели и
 * упала бы на проде; поймала это сверка со схемой живой базы, а не тесты.
 * Теперь ловят тесты.
 */
describe("миграция колонки арендатора", () => {
  const migration = readFileSync(
    join(process.cwd(), "prisma/migrations/20260902030000_tenant_id_on_roots/migration.sql"),
    "utf8",
  );

  function tableNameOf(model: string): string {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const block = schema.match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, "m"));
    const mapped = block?.[1].match(/@@map\("([^"]+)"\)/);
    return mapped ? mapped[1] : model;
  }

  it("трогает таблицу каждой корневой модели — под её настоящим именем", () => {
    // Таблицы, заведённые уже мультиарендными, эта миграция не касается: у них
    // колонка появилась вместе с самой таблицей, в их собственной миграции.
    const bornMultiTenant = new Set(["TenantCounter"]);
    const missed = Object.entries(MODEL_CLASSIFICATION)
      .filter(([name, e]) => e.kind === "TENANT" && !bornMultiTenant.has(name))
      .map(([name]) => ({ model: name, table: tableNameOf(name) }))
      .filter(({ table }) => !migration.includes(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantId"`))
      .map(({ model, table }) => `${model} (таблица ${table})`);
    expect(missed, `не покрыты миграцией: ${missed.join(", ")}`).toEqual([]);
  });

  it("каждая дочерняя таблица получает составной внешний ключ", () => {
    // Ради этого ключа всё и делалось: одна колонка — пометка, которую код
    // может проставить неверно; ключ (родитель + арендатор) делает привязку к
    // чужому родителю невозможной на уровне базы.
    const children = readFileSync(
      join(process.cwd(), "prisma/migrations/20260902040000_tenant_id_on_children/migration.sql"),
      "utf8",
    );
    const missed = Object.entries(MODEL_CLASSIFICATION)
      .filter(([, e]) => e.kind === "TENANT_CHILD")
      .map(([name]) => ({ model: name, table: tableNameOf(name) }))
      .filter(({ table }) => !children.includes(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tenant_parent_fkey"`))
      .map(({ model }) => model);
    expect(missed, `без составного ключа: ${missed.join(", ")}`).toEqual([]);
  });

  it("не обращается к имени модели там, где имя таблицы другое", () => {
    // Ровно та ошибка, что была: ALTER TABLE "PartShipment" вместо "PartOrder".
    expect(migration).not.toContain('ALTER TABLE "PartShipment"');
    expect(migration).toContain('ALTER TABLE "PartOrder"');
  });
});
