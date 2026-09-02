import { describe, expect, it } from "vitest";

import { scopeQuery } from "@/lib/tenant/scope";

/**
 * Правила шва изоляции.
 *
 * Проверяются именно правила, а не живая база: тест на базе доказывает один
 * случай, тест на правилах — все операции разом. Живой негативный тест идёт
 * отдельно и доказывает, что шов подключён.
 */

const TENANT = "tenant_geleoteka";
const MODELS = new Set(["Deal", "RepairOrder", "User", "CustomerContact"]);

function scope(model: string, operation: string, args: Record<string, unknown> = {}) {
  return scopeQuery({ model, operation, args, tenantId: TENANT, tenantModels: MODELS });
}

describe("правила сужения запроса по арендатору", () => {
  it("чтение списка сужается условием", () => {
    const r = scope("Deal", "findMany", { where: { stage: "NEW" } });
    expect(r.args.where).toEqual({ stage: "NEW", tenantId: TENANT });
  });

  it("чтение без условия получает условие", () => {
    expect(scope("Deal", "findMany").args.where).toEqual({ tenantId: TENANT });
  });

  it("ПОИСК ПО ИДЕНТИФИКАТОРУ тоже получает условие по арендатору", () => {
    // Главный случай: зная чужой идентификатор, прочитать чужую строку нельзя.
    // Prisma 6 допускает фильтр рядом с уникальным полем, поэтому операция не
    // подменяется — проверено живым тестом на настоящей базе.
    const r = scope("Deal", "findUnique", { where: { id: "d1" } });
    expect(r.operation).toBe("findUnique");
    expect(r.args.where).toEqual({ id: "d1", tenantId: TENANT });
  });

  it("findUniqueOrThrow сохраняет строгость и получает условие", () => {
    // Строка чужого арендатора должна давать ошибку «не найдено», а не строку.
    const r = scope("Deal", "findUniqueOrThrow", { where: { id: "d1" } });
    expect(r.operation).toBe("findUniqueOrThrow");
    expect(r.args.where).toEqual({ id: "d1", tenantId: TENANT });
  });

  it("создание проставляет арендатора в данные", () => {
    expect(scope("Deal", "create", { data: { title: "x" } }).args.data).toEqual({
      title: "x",
      tenantId: TENANT,
    });
  });

  it("пакетное создание проставляет арендатора каждой строке", () => {
    const r = scope("Deal", "createMany", { data: [{ title: "a" }, { title: "b" }] });
    expect(r.args.data).toEqual([
      { title: "a", tenantId: TENANT },
      { title: "b", tenantId: TENANT },
    ]);
  });

  it("upsert получает арендатора и в условие, и в создаваемую строку", () => {
    // Половина защиты здесь бесполезна: нашёл — обновил бы чужую, не нашёл —
    // создал бы ничью.
    const r = scope("Deal", "upsert", { where: { id: "d1" }, create: { title: "x" }, update: {} });
    expect(r.args.where).toEqual({ id: "d1", tenantId: TENANT });
    expect(r.args.create).toEqual({ title: "x", tenantId: TENANT });
  });

  it("удаление сужается условием", () => {
    expect(scope("Deal", "deleteMany", { where: { stage: "LOST" } }).args.where).toEqual({
      stage: "LOST",
      tenantId: TENANT,
    });
  });

  it("изменение сужается условием", () => {
    expect(scope("RepairOrder", "update", { where: { id: "ro1" }, data: {} }).args.where).toEqual({
      id: "ro1",
      tenantId: TENANT,
    });
  });

  it("общие справочники проходят нетронутыми", () => {
    // У VehicleGeneration колонки арендатора нет: условие по ней было бы
    // ошибкой запроса, а не защитой.
    const r = scope("VehicleGeneration", "findMany", { where: { code: "W463" } });
    expect(r.args.where).toEqual({ code: "W463" });
  });

  it("дочерние модели сужаются наравне с корневыми", () => {
    expect(scope("CustomerContact", "findMany").args.where).toEqual({ tenantId: TENANT });
  });
});
