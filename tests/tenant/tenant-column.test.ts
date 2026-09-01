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

describe("колонка арендатора в схеме", () => {
  const blocks = modelBlocks();

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
      .filter(([, body]) => hasTenantId(body))
      .filter(([, body]) => !/@@index\(\[tenantId\]\)/.test(body))
      .map(([name]) => name);
    expect(unindexed, `без индекса: ${unindexed.join(", ")}`).toEqual([]);
  });

  it("колонка объявлена необязательной — это фаза expand", () => {
    // Обязательной она станет, когда все записи будут проставлять её явно.
    // Сделать её NOT NULL сейчас значит уронить прод на первой же записи.
    const required = [...blocks.entries()]
      .filter(([, body]) => /^\s+tenantId\s+String\s/m.test(body))
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
    const missed = Object.entries(MODEL_CLASSIFICATION)
      .filter(([, e]) => e.kind === "TENANT")
      .map(([name]) => ({ model: name, table: tableNameOf(name) }))
      .filter(({ table }) => !migration.includes(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantId"`))
      .map(({ model, table }) => `${model} (таблица ${table})`);
    expect(missed, `не покрыты миграцией: ${missed.join(", ")}`).toEqual([]);
  });

  it("не обращается к имени модели там, где имя таблицы другое", () => {
    // Ровно та ошибка, что была: ALTER TABLE "PartShipment" вместо "PartOrder".
    expect(migration).not.toContain('ALTER TABLE "PartShipment"');
    expect(migration).toContain('ALTER TABLE "PartOrder"');
  });
});
