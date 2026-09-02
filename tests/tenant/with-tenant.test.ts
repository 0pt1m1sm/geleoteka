import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Отказ шва при пустом арендаторе.
 *
 * Это не формальность: пустая строка в условии `where` не сужает выборку, и
 * вызов без арендатора прочитал бы всю базу — на мультиарендной установке это
 * чужие данные. Падать здесь дешевле, чем отдавать их.
 */
describe("шов без арендатора", () => {
  it("отказывается работать с пустым идентификатором", async () => {
    const { withTenant } = await import("@/lib/tenant/with-tenant");
    const client = { $extends: () => ({}) };
    expect(() => withTenant(client, "")).toThrow(/без арендатора/);
  });

  it("с идентификатором расширяет клиент, а не подменяет", async () => {
    const { withTenant } = await import("@/lib/tenant/with-tenant");
    const marker = { extended: true };
    const client = { $extends: () => marker };
    expect(withTenant(client, "tenant_geleoteka")).toBe(marker);
  });
});
