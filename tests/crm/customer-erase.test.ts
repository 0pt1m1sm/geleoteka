import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const customerName = "Имя Для Удаления";
  const customerId = "customer-erase";
  const requireRole = vi.fn();
  const recordAudit = vi.fn();
  const revalidatePath = vi.fn();
  const staffNotificationEvents: Array<Record<string, unknown>> = [];
  const staffNotificationReceipts: Array<Record<string, unknown>> = [];
  const staffNotificationDeliveries: Array<Record<string, unknown>> = [];
  const staffNotificationEventDeleteMany = vi.fn(async (args: Record<string, unknown>) => {
    const where = args.where as { relatedCustomerUserId: string };
    const removedIds = staffNotificationEvents
      .filter((event) => event.relatedCustomerUserId === where.relatedCustomerUserId)
      .map((event) => event.id);
    for (let i = staffNotificationEvents.length - 1; i >= 0; i -= 1) {
      if (removedIds.includes(staffNotificationEvents[i].id)) staffNotificationEvents.splice(i, 1);
    }
    for (let i = staffNotificationReceipts.length - 1; i >= 0; i -= 1) {
      if (removedIds.includes(staffNotificationReceipts[i].eventId)) {
        staffNotificationReceipts.splice(i, 1);
      }
    }
    for (let i = staffNotificationDeliveries.length - 1; i >= 0; i -= 1) {
      if (removedIds.includes(staffNotificationDeliveries[i].eventId)) {
        staffNotificationDeliveries.splice(i, 1);
      }
    }
    return { count: removedIds.length };
  });

  const noopCount = vi.fn(async () => 0);
  const noopWrite = vi.fn(async () => ({ count: 0 }));
  const tx = {
    deal: { updateMany: noopWrite },
    repairOrder: { updateMany: noopWrite },
    vehicle: { deleteMany: noopWrite, updateMany: noopWrite },
    communicationLog: { deleteMany: noopWrite },
    staffNotificationEvent: { deleteMany: staffNotificationEventDeleteMany },
    user: { delete: vi.fn(async () => ({})) },
  };
  const db = {
    vehicle: { count: noopCount },
    repairOrder: { count: noopCount },
    deal: { count: noopCount },
    communicationLog: { count: noopCount },
    crmTask: { count: noopCount },
    user: {
      count: vi.fn(async () => 1),
      findUnique: vi.fn(async () => ({
        id: customerId,
        email: "erase@example.test",
        phone: null,
        name: customerName,
        isCustomer: true,
        isSupplier: false,
        permissionRole: "CLIENT",
      })),
    },
    customerContact: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return {
    customerName,
    customerId,
    requireRole,
    recordAudit,
    revalidatePath,
    staffNotificationEvents,
    staffNotificationReceipts,
    staffNotificationDeliveries,
    staffNotificationEventDeleteMany,
    db,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => h.requireRole(...args),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => h.recordAudit(...args),
}));
vi.mock("@/lib/fulfillment/reservations", () => ({
  releasePartLinesForEstimate: vi.fn(),
}));
vi.mock("@/lib/wms-host", () => ({ actorId: () => "admin-1" }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => h.revalidatePath(...args),
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { eraseCustomer, getEraseImpact } from "@/app/actions/crm/customer-erase";

beforeEach(() => {
  h.requireRole.mockReset();
  h.recordAudit.mockReset();
  h.revalidatePath.mockReset();
  h.staffNotificationEventDeleteMany.mockClear();
  h.requireRole.mockResolvedValue({ id: "admin-1", permissionRole: "ADMIN" });
  h.recordAudit.mockResolvedValue(undefined);

  h.staffNotificationEvents.splice(
    0,
    h.staffNotificationEvents.length,
    {
      id: "event-customer",
      relatedCustomerUserId: h.customerId,
      summary: `Новое письмо: ${h.customerName}`,
    },
    {
      id: "event-other",
      relatedCustomerUserId: "customer-other",
      summary: "Новое письмо: Другой клиент",
    },
  );
  h.staffNotificationReceipts.splice(
    0,
    h.staffNotificationReceipts.length,
    { id: "receipt-customer", eventId: "event-customer" },
    { id: "receipt-other", eventId: "event-other" },
  );
  h.staffNotificationDeliveries.splice(
    0,
    h.staffNotificationDeliveries.length,
    { id: "delivery-customer", eventId: "event-customer" },
    { id: "delivery-other", eventId: "event-other" },
  );
});

describe("eraseCustomer staff notifications", () => {
  it("deletes the customer's events and cascades receipts/deliveries in the erase transaction", async () => {
    const impact = await getEraseImpact(h.customerId);
    if (!impact.ok) throw new Error(impact.error);

    await expect(
      eraseCustomer(h.customerId, "erase@example.test", impact.token),
    ).resolves.toMatchObject({ ok: true });

    expect(h.staffNotificationEventDeleteMany).toHaveBeenCalledWith({
      where: { relatedCustomerUserId: h.customerId },
    });
    expect(h.staffNotificationEvents).toEqual([
      expect.objectContaining({ id: "event-other" }),
    ]);
    expect(h.staffNotificationReceipts).toEqual([
      expect.objectContaining({ id: "receipt-other" }),
    ]);
    expect(h.staffNotificationDeliveries).toEqual([
      expect.objectContaining({ id: "delivery-other" }),
    ]);
    expect(
      JSON.stringify({
        events: h.staffNotificationEvents,
        receipts: h.staffNotificationReceipts,
        deliveries: h.staffNotificationDeliveries,
      }),
    ).not.toContain(h.customerName);
  });
});
