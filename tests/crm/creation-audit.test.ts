import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole: (...args: unknown[]) => requireRole(...args) }));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...args: unknown[]) => recordAudit(...args) }));

const redirect = vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); });
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const createDeal = vi.fn();
vi.mock("@/lib/crm/public", () => ({
  createDeal: (...args: unknown[]) => createDeal(...args),
  nextEstimateNumber: vi.fn(),
  dispatchFulfillment: vi.fn(),
  recomputeEstimateTotals: vi.fn(),
}));
vi.mock("@/lib/crm/public/create-deal", () => ({
  createDeal: (...args: unknown[]) => createDeal(...args),
}));
vi.mock("@/lib/fulfillment/reservations", () => ({
  releasePartLinesForEstimate: vi.fn(),
  reservePartLinesForEstimate: vi.fn(),
}));
vi.mock("@/lib/wms-host", () => ({ actorId: vi.fn() }));

const userFindUnique = vi.fn();
const vehicleFindUnique = vi.fn();
const dealFindUnique = vi.fn();
const estimateFindFirst = vi.fn();
const estimateCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    vehicle: { findUnique: (...args: unknown[]) => vehicleFindUnique(...args) },
    deal: { findUnique: (...args: unknown[]) => dealFindUnique(...args) },
    estimate: {
      findFirst: (...args: unknown[]) => estimateFindFirst(...args),
      create: (...args: unknown[]) => estimateCreate(...args),
    },
  },
}));

import { createDealManually } from "@/app/actions/crm/deals";
import { openOrCreateActiveEstimate } from "@/app/actions/crm/estimates";

beforeEach(() => {
  for (const mock of [
    requireRole,
    recordAudit,
    redirect,
    createDeal,
    userFindUnique,
    vehicleFindUnique,
    dealFindUnique,
    estimateFindFirst,
    estimateCreate,
  ]) mock.mockReset();
  requireRole.mockResolvedValue({
    id: "manager-1",
    name: "Менеджер",
    permissionRole: "MANAGER",
  });
  recordAudit.mockResolvedValue(undefined);
  redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("deal and estimate creation audit", () => {
  it("audits manual deal creation without free-form notes", async () => {
    userFindUnique.mockResolvedValue({ id: "customer-1" });
    createDeal.mockResolvedValue({ id: "deal-1", number: "D-1042" });
    const formData = new FormData();
    formData.set("customerUserId", "customer-1");
    formData.set("channel", "WALK_IN");
    formData.set("notes", "SENSITIVE-DEAL-NOTES");

    await expect(createDealManually(null, formData)).rejects.toThrow(
      "REDIRECT:/admin/crm/deals/deal-1",
    );

    expect(recordAudit).toHaveBeenCalledWith({
      actor: expect.objectContaining({ id: "manager-1" }),
      action: "deal.create",
      targetType: "Deal",
      targetId: "deal-1",
      targetLabel: "D-1042",
      metadata: {
        customerUserId: "customer-1",
        vehicleId: null,
        channel: "WALK_IN",
        source: "manual",
      },
    });
    expect(JSON.stringify(recordAudit.mock.calls)).not.toContain("SENSITIVE-DEAL-NOTES");
  });

  it("audits creation of a new blank estimate", async () => {
    dealFindUnique.mockResolvedValue({ id: "deal-1" });
    estimateFindFirst.mockResolvedValue(null);
    estimateCreate.mockResolvedValue({ id: "estimate-1" });
    const formData = new FormData();
    formData.set("dealId", "deal-1");

    await expect(openOrCreateActiveEstimate(null, formData)).resolves.toEqual({
      error: null,
      estimateId: "estimate-1",
    });

    expect(recordAudit).toHaveBeenCalledWith({
      actor: expect.objectContaining({ id: "manager-1" }),
      action: "estimate.create",
      targetType: "Estimate",
      targetId: "estimate-1",
      targetLabel: "estimate-1",
      metadata: { dealId: "deal-1", kind: "blank" },
    });
  });
});
