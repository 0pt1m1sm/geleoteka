import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { liveDatabaseUrl } from "../helpers/live-db";

vi.mock("server-only", () => ({}));

/**
 * Негативный тест изоляции на ЖИВОЙ базе.
 *
 * Правила сужения проверены отдельно и по всем операциям; здесь доказывается
 * другое — что шов подключён и работает на настоящем Prisma, а не только в
 * рассуждении. Без этого теста «изоляция сделана» остаётся заявлением.
 *
 * Тест поднимает собственную схему в локальной базе разработчика и сносит её
 * после прогона: трогать общие данные ради проверки изоляции было бы иронично.
 */
const schema = `tenant_iso_test_${process.pid}_${Date.now()}`;

function urlForSchema(base: string, name: string): string {
  const url = new URL(base);
  url.searchParams.set("schema", name);
  return url.toString();
}

let admin: PrismaClient;
let client: PrismaClient;
let withTenant: typeof import("@/lib/tenant/with-tenant").withTenant;

const OUR = "tenant_geleoteka";
const THEIRS = "tenant_vtoroy";

describe.sequential("изоляция арендаторов на живой базе", () => {
  beforeAll(async () => {
    const local = liveDatabaseUrl();

    admin = new PrismaClient({ datasourceUrl: local });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);

    const isolated = urlForSchema(local, schema);
    // НАСТОЯЩИЕ миграции, а не `db push` из схемы. Разница принципиальна:
    // умолчание колонки арендатора и составные внешние ключи объявлены только
    // в миграциях (осознанный дрейф — см. их комментарии), и база, собранная
    // из схемы, не имеет ни того, ни другого. Первая версия этого теста именно
    // так и обманывалась: проверяла защиту, которой в тестовой базе не было.
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: isolated },
      stdio: "pipe",
    });

    client = new PrismaClient({ datasourceUrl: isolated });
    ({ withTenant } = await import("@/lib/tenant/with-tenant"));

    // Первого арендатора создаёт сама миграция — она же вставляет строку
    // установки. Заводим только второго, иначе упрёмся в уникальность.
    await client.tenant.createMany({
      data: [
        { id: OUR, key: "geleoteka", name: "Гелеотека" },
        { id: THEIRS, key: "vtoroy", name: "Второй сервис" },
      ],
      skipDuplicates: true,
    });
    // По клиенту и сделке каждому арендатору — минимум, на котором видно утечку.
    for (const [tenantId, suffix] of [
      [OUR, "nash"],
      [THEIRS, "chuzhoy"],
    ] as const) {
      await client.user.create({
        data: {
          id: `u_${suffix}`,
          email: `${suffix}@example.com`,
          phone: `+7000000000${suffix === "nash" ? 1 : 2}`,
          passwordHash: "x",
          name: `Клиент ${suffix}`,
          permissionRole: "CLIENT",
          tenantId,
        },
      });
      await client.deal.create({
        data: {
          id: `d_${suffix}`,
          customer: { connect: { id: `u_${suffix}` } },
          source: `сделка-${suffix}`,
          channel: "SERVICE",
          tenantId,
        },
      });
    }
  }, 180_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });

  it("список сделок отдаёт только свои", async () => {
    const ours = await withTenant(client, OUR).deal.findMany();
    expect(ours.map((d) => d.id)).toEqual(["d_nash"]);
  });

  it("ПОИСК ЧУЖОЙ СДЕЛКИ ПО ИДЕНТИФИКАТОРУ НИЧЕГО НЕ ОТДАЁТ", async () => {
    // Ровно та дыра, ради которой findUnique переписывается: зная чужой
    // идентификатор, прочитать чужую сделку нельзя.
    const stolen = await withTenant(client, OUR).deal.findUnique({ where: { id: "d_chuzhoy" } });
    expect(stolen).toBeNull();
  });

  it("свою сделку по идентификатору читает как обычно", async () => {
    const own = await withTenant(client, OUR).deal.findUnique({ where: { id: "d_nash" } });
    expect(own?.source).toBe("сделка-nash");
  });

  it("клиенты чужого арендатора не видны", async () => {
    const users = await withTenant(client, OUR).user.findMany();
    expect(users.map((u) => u.id)).toEqual(["u_nash"]);
  });

  it("счётчик считает только своих", async () => {
    expect(await withTenant(client, OUR).deal.count()).toBe(1);
    expect(await withTenant(client, THEIRS).deal.count()).toBe(1);
  });

  it("создание через шов проставляет своего арендатора", async () => {
    const created = await withTenant(client, THEIRS).deal.create({
      data: { customer: { connect: { id: "u_chuzhoy" } }, source: "ещё-одна", channel: "SERVICE" },
    });
    expect(created.tenantId).toBe(THEIRS);
    // И она не видна первому арендатору.
    const seenByUs = await withTenant(client, OUR).deal.findUnique({ where: { id: created.id } });
    expect(seenByUs).toBeNull();
  });

  it("изменение не дотягивается до чужой строки", async () => {
    const res = await withTenant(client, OUR).deal.updateMany({
      where: { id: "d_chuzhoy" },
      data: { source: "перехвачено" },
    });
    expect(res.count).toBe(0);
    const untouched = await client.deal.findUnique({ where: { id: "d_chuzhoy" } });
    expect(untouched?.source).toBe("сделка-chuzhoy");
  });

  it("удаление не дотягивается до чужой строки", async () => {
    const res = await withTenant(client, OUR).deal.deleteMany({ where: { id: "d_chuzhoy" } });
    expect(res.count).toBe(0);
    expect(await client.deal.findUnique({ where: { id: "d_chuzhoy" } })).not.toBeNull();
  });

  it("вложенное создание получает арендатора от базы, а не от шва", async () => {
    // Шов проставляет арендатора только в данные верхнего уровня. Вложенную
    // строку прикрывает база: умолчание колонки и составной ключ. Проверяем,
    // что это действительно работает, а не считается работающим.
    const deal = await withTenant(client, OUR).deal.create({
      data: {
        customer: { connect: { id: "u_nash" } },
        source: "вложенное-создание",
        channel: "SERVICE",
        estimates: { create: [{ stage: "DRAFT" }] },
      },
      include: { estimates: true },
    });
    expect(deal.tenantId).toBe(OUR);
    expect(deal.estimates[0].tenantId).toBe(OUR);
  });

  it("СМЕТУ НЕЛЬЗЯ ПРИВЯЗАТЬ К СДЕЛКЕ ЧУЖОГО АРЕНДАТОРА", async () => {
    // Дыра, которую нашёл этот же тест: составные ключи закрывали связи
    // родитель-ребёнок, но не ссылки между корневыми сущностями. Смета —
    // корень, и до ключей она могла указывать на чужую сделку.
    const theirs = await withTenant(client, THEIRS).deal.create({
      data: { customer: { connect: { id: "u_chuzhoy" } }, source: "чужая", channel: "SERVICE" },
    });
    await expect(
      client.estimate.create({ data: { dealId: theirs.id, stage: "DRAFT", tenantId: OUR } }),
    ).rejects.toThrow();
  });

  it("удаление машины обнуляет ссылку, но не арендатора сделки", async () => {
    // Обнуление пары вместе с арендатором вычистило бы владельца строки —
    // лечение хуже болезни. Поэтому SET NULL с указанием колонки.
    const car = await withTenant(client, OUR).vehicle.create({
      data: { owner: { connect: { id: "u_nash" } }, make: "Mercedes-Benz", model: "G 350", year: 2016 },
    });
    const deal = await withTenant(client, OUR).deal.create({
      data: {
        customer: { connect: { id: "u_nash" } },
        vehicle: { connect: { id: car.id } },
        source: "с машиной",
        channel: "SERVICE",
      },
    });
    await client.vehicle.delete({ where: { id: car.id } });
    const after = await client.deal.findUnique({ where: { id: deal.id } });
    expect(after?.vehicleId).toBeNull();
    expect(after?.tenantId).toBe(OUR);
  });

  it("общий справочник виден обоим", async () => {
    // Изоляция не должна превращаться в раздельные Мерседесы.
    await client.manufacturer.create({ data: { id: "mb", name: "Mercedes-Benz", slug: "mercedes-benz" } });
    expect(await withTenant(client, OUR).manufacturer.count()).toBe(1);
    expect(await withTenant(client, THEIRS).manufacturer.count()).toBe(1);
  });
});
