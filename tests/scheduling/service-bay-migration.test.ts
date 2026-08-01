import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260801190000_service_bay_resource_model/migration.sql",
  ),
  "utf8",
);
const slotModel = schema.match(/model Slot \{[\s\S]*?\n\}/)?.[0] ?? "";

describe("ServiceBay schema and handwritten migration", () => {
  it("models the database guarantee as compound dateTime + bayId uniqueness", () => {
    expect(slotModel).toContain("@@unique([dateTime, bayId])");
    expect(slotModel).not.toMatch(/dateTime\s+DateTime\s+@unique/);
  });

  it("creates the replacement guarantee before dropping the old index", () => {
    const addBay = migration.indexOf('ADD COLUMN "bayId"');
    const backfill = migration.indexOf('SET "bayId" =');
    const notNull = migration.indexOf('ALTER COLUMN "bayId" SET NOT NULL');
    const compound = migration.indexOf('CREATE UNIQUE INDEX "Slot_dateTime_bayId_key"');
    const dropOld = migration.indexOf('DROP INDEX "Slot_dateTime_key"');

    expect(addBay).toBeGreaterThan(0);
    expect(backfill).toBeGreaterThan(addBay);
    expect(notNull).toBeGreaterThan(backfill);
    expect(compound).toBeGreaterThan(notNull);
    expect(dropOld).toBeGreaterThan(compound);
    expect(migration.trim().startsWith("-- Resource-backed")).toBe(true);
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });

  it("does not contain unrelated destructive index drift", () => {
    expect(migration).not.toMatch(/DROP INDEX\s+"Part_photos_gin_idx"/);
    expect(migration).not.toMatch(/DROP INDEX\s+"Vehicle_photos_gin_idx"/);
    expect(migration).not.toMatch(/ALTER INDEX\s+"StockMovement[^\n]+RENAME/i);
  });
});
