import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import {
  isServiceBayAllocationConflict,
  NoServiceBayAvailable,
  reserveServiceBaySlot,
  SERVICE_BAY_CONFLICT_MESSAGE,
  type ServiceBayAllocationTx,
} from "@/lib/scheduling/service-bays";

const AT_13 = new Date("2026-09-07T10:00:00.000Z");

function datasourceForSchema(base: string, schema: string): string {
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function twoPartyBarrier(): { wait(): Promise<void>; arrivals(): number } {
  let count = 0;
  let release!: () => void;
  const bothArrived = new Promise<void>((resolveBarrier) => {
    release = resolveBarrier;
  });
  return {
    async wait() {
      count += 1;
      if (count === 2) release();
      await bothArrived;
    },
    arrivals: () => count,
  };
}

describe.sequential("ServiceBay allocation — real PostgreSQL concurrency", () => {
  const schema = `resource_bay_test_${process.pid}_${Date.now()}`;
  let admin: PrismaClient;
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;

  beforeAll(async () => {
    // Vitest's default URL is deliberately non-connectable for unit tests. This
    // suite explicitly uses the developer's local DATABASE_URL, then isolates
    // itself in a generated schema that is dropped after the run.
    const env = parse(readFileSync(resolve(process.cwd(), ".env")));
    const localUrl = env.DATABASE_URL;
    if (!localUrl) throw new Error("Local DATABASE_URL is required for the real scheduling race test");

    admin = new PrismaClient({ datasourceUrl: localUrl });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);

    const isolatedUrl = datasourceForSchema(localUrl, schema);
    firstClient = new PrismaClient({ datasourceUrl: isolatedUrl });
    secondClient = new PrismaClient({ datasourceUrl: isolatedUrl });

    await firstClient.$executeRawUnsafe(`
      CREATE TABLE "ServiceBay" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
        -- Колонка арендатора: Prisma читает её в RETURNING, поэтому таблица,
        -- собранная здесь руками, обязана повторять форму модели.
        "tenantId" TEXT DEFAULT 'tenant_geleoteka',
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await firstClient.$executeRawUnsafe(`
      CREATE TABLE "Slot" (
        "id" TEXT PRIMARY KEY,
        "dateTime" TIMESTAMP(3) NOT NULL,
        "repairOrderId" TEXT NOT NULL UNIQUE,
        "bayId" TEXT NOT NULL REFERENCES "ServiceBay"("id") ON DELETE RESTRICT,
        "tenantId" TEXT DEFAULT 'tenant_geleoteka',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await firstClient.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "Slot_dateTime_bayId_key" ON "Slot"("dateTime", "bayId")`,
    );
  }, 20_000);

  beforeEach(async () => {
    await firstClient.slot.deleteMany();
    await firstClient.serviceBay.deleteMany();
  });

  afterAll(async () => {
    await Promise.allSettled([firstClient?.$disconnect(), secondClient?.$disconnect()]);
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });

  async function addBays(count: number): Promise<void> {
    for (let index = 1; index <= count; index += 1) {
      await firstClient.serviceBay.create({
        data: {
          id: `bay_${index}`,
          name: `Пост ${index}`,
          tenantKey: "geleoteka",
          isActive: true,
          sortOrder: index,
        },
      });
    }
  }

  async function reserve(client: PrismaClient, repairOrderId: string): Promise<{ bayId: string }> {
    return client.$transaction((tx) =>
      reserveServiceBaySlot(tx as unknown as ServiceBayAllocationTx, {
        repairOrderId,
        dateTime: AT_13,
      }),
    );
  }

  it("with one bay rejects a second booking at the same time", async () => {
    await addBays(1);

    await reserve(firstClient, "ro_1");
    await expect(reserve(firstClient, "ro_2")).rejects.toBeInstanceOf(NoServiceBayAvailable);

    expect(await firstClient.slot.count()).toBe(1);
  });

  it("with two bays accepts two bookings at the same time and rejects the third", async () => {
    await addBays(2);

    const first = await reserve(firstClient, "ro_1");
    const second = await reserve(firstClient, "ro_2");
    await expect(reserve(firstClient, "ro_3")).rejects.toBeInstanceOf(NoServiceBayAvailable);

    expect(new Set([first.bayId, second.bayId])).toEqual(new Set(["bay_1", "bay_2"]));
    expect(await firstClient.slot.count()).toBe(2);
  });

  it("lets exactly one of two real transactions take the last free bay", async () => {
    await addBays(2);
    await reserve(firstClient, "ro_existing");

    const barrier = twoPartyBarrier();
    const contenders = [
      firstClient.$transaction(async (tx) => {
        await barrier.wait();
        return reserveServiceBaySlot(tx as unknown as ServiceBayAllocationTx, {
          repairOrderId: "ro_racer_1",
          dateTime: AT_13,
        });
      }),
      secondClient.$transaction(async (tx) => {
        await barrier.wait();
        return reserveServiceBaySlot(tx as unknown as ServiceBayAllocationTx, {
          repairOrderId: "ro_racer_2",
          dateTime: AT_13,
        });
      }),
    ];

    const results = await Promise.allSettled(contenders);
    expect(barrier.arrivals()).toBe(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(isServiceBayAllocationConflict(rejected.reason)).toBe(true);
      expect(SERVICE_BAY_CONFLICT_MESSAGE).toBe(
        "Все рабочие посты на это время уже заняты. Выберите другое время.",
      );
    }
    expect(await firstClient.slot.count()).toBe(2);
  }, 20_000);
});
