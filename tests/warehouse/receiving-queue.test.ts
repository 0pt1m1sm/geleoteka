import { describe, expect, it } from "vitest";
import type { DbClientPort } from "@/lib/wms/public";
import { receivingQueue } from "@/lib/warehouse/receiving-queue";
import { OPEN_SUPPLIER_ORDER_STATUSES } from "@/lib/warehouse/incoming";

interface CapturedArgs {
  where?: { status?: { in?: string[] } };
  select?: Record<string, unknown>;
}

function stubClient(rows: unknown[], captured: { args?: CapturedArgs }) {
  return {
    supplierOrder: {
      findMany: async (args: CapturedArgs) => {
        captured.args = args;
        return rows;
      },
    },
  } as unknown as DbClientPort;
}

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "so_1",
    orderNumber: "PO-1",
    orderDate: new Date("2026-07-01"),
    estimatedArrival: null,
    status: "ORDERED",
    supplier: { name: "Поставщик" },
    items: [
      { quantity: 3, receivedQuantity: 1 },
      { quantity: 2, receivedQuantity: 0 },
    ],
    ...over,
  };
}

describe("receivingQueue", () => {
  it("queries only OPEN statuses and selects ZERO money fields (worker-safe payload)", async () => {
    const captured: { args?: CapturedArgs } = {};
    await receivingQueue(stubClient([], captured), new Date("2026-07-11"));

    expect(captured.args?.where?.status?.in).toEqual([...OPEN_SUPPLIER_ORDER_STATUSES]);

    // The confidentiality contract: no cost/price/profit keys anywhere in the select.
    const flat = JSON.stringify(captured.args?.select ?? {}).toLowerCase();
    for (const banned of ["cost", "price", "profit"]) {
      expect(flat).not.toContain(banned);
    }

    // Progress must count PART lines only — the relation select carries the filter.
    expect(captured.args?.select?.items).toMatchObject({ where: { type: "PART" } });
  });

  it("shapes PART progress sums per order", async () => {
    const captured = {};
    const rows = await receivingQueue(stubClient([row()], captured), new Date("2026-07-11"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: "so_1",
      orderNumber: "PO-1",
      supplierName: "Поставщик",
      orderedTotal: 5,
      receivedTotal: 1,
      overdue: false,
    });
  });

  it("sorts overdue deliveries first, then by order date ascending", async () => {
    const now = new Date("2026-07-11");
    const rows = await receivingQueue(
      stubClient(
        [
          row({ id: "b_new", orderDate: new Date("2026-07-05"), estimatedArrival: null }),
          row({ id: "a_old", orderDate: new Date("2026-07-01"), estimatedArrival: null }),
          row({ id: "c_overdue", orderDate: new Date("2026-07-08"), estimatedArrival: new Date("2026-07-09") }),
        ],
        {},
      ),
      now,
    );
    expect(rows.map((r) => r.orderId)).toEqual(["c_overdue", "a_old", "b_new"]);
    expect(rows[0].overdue).toBe(true);
  });

  it("treats a missing supplier name as a dash", async () => {
    const rows = await receivingQueue(stubClient([row({ supplier: null })], {}), new Date("2026-07-11"));
    expect(rows[0].supplierName).toBe("—");
  });

  it("a fully-received order with a past ETA is NOT overdue", async () => {
    const rows = await receivingQueue(
      stubClient(
        [row({ estimatedArrival: new Date("2026-07-01"), items: [{ quantity: 3, receivedQuantity: 3 }] })],
        {},
      ),
      new Date("2026-07-11"),
    );
    expect(rows[0].overdue).toBe(false);
  });

  it("drops orders with nothing receivable (no PART lines) from the queue", async () => {
    const rows = await receivingQueue(stubClient([row({ items: [] })], {}), new Date("2026-07-11"));
    expect(rows).toHaveLength(0);
  });
});
