import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TENANT_KEY,
  invalidateTenantCache,
  requireTenantId,
  resolveTenant,
} from "@/lib/tenant";

/**
 * Резолвер арендатора установки.
 *
 * Главное свойство — отсутствие строки не должно превращаться в тихую работу
 * «куда-нибудь»: запись данных без арендатора на мультиарендной базе означает
 * строки, которые не принадлежат никому и видны всем.
 */

function reader(row: unknown, spy = vi.fn()) {
  return {
    tenant: {
      findUnique: async (args: unknown) => {
        spy(args);
        return row;
      },
    },
    spy,
  };
}

const ROW = { id: "tenant_geleoteka", key: "geleoteka", name: "Гелеотека", status: "ACTIVE" };

describe("арендатор установки", () => {
  beforeEach(() => invalidateTenantCache());

  it("читается по ключу установки", async () => {
    const r = reader(ROW);
    expect(await resolveTenant(r)).toEqual(ROW);
    expect(r.spy).toHaveBeenCalledWith(expect.objectContaining({ where: { key: TENANT_KEY } }));
  });

  it("второй раз берётся из кэша, а не из базы", async () => {
    // Строка меняется раз в жизни установки, а читается на каждом запросе.
    const r = reader(ROW);
    await resolveTenant(r);
    await resolveTenant(r);
    expect(r.spy).toHaveBeenCalledTimes(1);
  });

  it("сброс кэша заставляет перечитать", async () => {
    const r = reader(ROW);
    await resolveTenant(r);
    invalidateTenantCache();
    await resolveTenant(r);
    expect(r.spy).toHaveBeenCalledTimes(2);
  });

  it("кэш не подменяет ответ для другого ключа", async () => {
    // Иначе на платформе первый прочитанный арендатор отвечал бы за всех.
    const first = reader(ROW);
    await resolveTenant(first);
    const second = reader({ ...ROW, id: "t2", key: "vtoroy", name: "Второй" });
    const got = await resolveTenant(second, "vtoroy");
    expect(got?.key).toBe("vtoroy");
  });

  it("отсутствие строки возвращается как null, а не выдумывается", async () => {
    expect(await resolveTenant(reader(null))).toBeNull();
  });

  it("requireTenantId падает внятно, если арендатора нет", async () => {
    // Это не восстановимая ситуация, а недокатанная миграция. Тихо подставить
    // что-то вместо идентификатора значило бы записать данные в никуда.
    await expect(requireTenantId(reader(null))).rejects.toThrow(/Tenant/);
  });

  it("requireTenantId отдаёт идентификатор, а не ключ", async () => {
    // Связи следующих историй идут по id: переименование сервиса не должно
    // означать миграцию всех таблиц.
    expect(await requireTenantId(reader(ROW))).toBe("tenant_geleoteka");
  });
});
