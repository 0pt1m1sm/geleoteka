"use server";

// Warehouse (physical site) management — WMS Phase 6. Warehouses are the
// orthogonal-to-tenant physical-site axis; stock rows are per (part, warehouse).
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/wms-host";

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}

/** All warehouses for the tenant, default first then by code. */
export async function listWarehouses(): Promise<WarehouseRow[]> {
  await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  return (await db.warehouse.findMany({
    where: { tenantKey: TENANT_KEY },
    select: { id: true, code: true, name: true, isActive: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
  })) as WarehouseRow[];
}

/**
 * Create a warehouse (admin/manager). Code is uppercased + unique per tenant.
 * Never creates a second default — the seeded MAIN stays the default.
 */
export async function createWarehouse(code: string, name: string): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const c = (code ?? "").trim().toUpperCase();
  const n = (name ?? "").trim();
  if (!c || !n) return { error: "Укажите код и название склада" };
  if (!/^[A-Z0-9-]{1,16}$/.test(c)) return { error: "Код: латиница/цифры/дефис, до 16 символов" };

  const dupe = (await db.warehouse.findFirst({
    where: { tenantKey: TENANT_KEY, code: c },
    select: { id: true },
  })) as { id: string } | null;
  if (dupe) return { error: `Склад с кодом ${c} уже существует` };

  await db.warehouse.create({
    data: { code: c, name: n, tenantKey: TENANT_KEY, isActive: true, isDefault: false },
  });
  return { error: null };
}

const CODE_RE = /^[A-Z0-9-]{1,16}$/;

/** Edit a warehouse's code/name (admin/manager). Code stays unique per tenant. */
export async function editWarehouse(id: string, code: string, name: string): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const c = (code ?? "").trim().toUpperCase();
  const n = (name ?? "").trim();
  if (!c || !n) return { error: "Укажите код и название склада" };
  if (!CODE_RE.test(c)) return { error: "Код: латиница/цифры/дефис, до 16 символов" };
  const existing = (await db.warehouse.findFirst({
    where: { id, tenantKey: TENANT_KEY },
    select: { id: true },
  })) as { id: string } | null;
  if (!existing) return { error: "Склад не найден" };
  const dupe = (await db.warehouse.findFirst({
    where: { tenantKey: TENANT_KEY, code: c, id: { not: id } },
    select: { id: true },
  })) as { id: string } | null;
  if (dupe) return { error: `Склад с кодом ${c} уже существует` };
  await db.warehouse.update({ where: { id }, data: { code: c, name: n } });
  return { error: null };
}

/** Make a warehouse the tenant default (admin/manager). Clears the previous
 *  default and sets the new one in one transaction; the partial unique index
 *  `Warehouse_one_default_per_tenant` is the concurrency backstop. */
export async function setDefaultWarehouse(id: string): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const wh = (await db.warehouse.findFirst({
    where: { id, tenantKey: TENANT_KEY },
    select: { id: true, isActive: true },
  })) as { id: string; isActive: boolean } | null;
  if (!wh) return { error: "Склад не найден" };
  if (!wh.isActive) return { error: "Нельзя сделать неактивный склад складом по умолчанию" };
  await db.$transaction(async (tx) => {
    await tx.warehouse.updateMany({ where: { tenantKey: TENANT_KEY, isDefault: true }, data: { isDefault: false } });
    await tx.warehouse.update({ where: { id }, data: { isDefault: true } });
  });
  return { error: null };
}

/** Activate/deactivate a warehouse (admin/manager). The default warehouse can't
 *  be deactivated — reassign the default first. */
export async function setWarehouseActive(id: string, active: boolean): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const wh = (await db.warehouse.findFirst({
    where: { id, tenantKey: TENANT_KEY },
    select: { id: true, isDefault: true },
  })) as { id: string; isDefault: boolean } | null;
  if (!wh) return { error: "Склад не найден" };
  if (!active && wh.isDefault) return { error: "Нельзя деактивировать склад по умолчанию — сначала назначьте другой" };
  await db.warehouse.update({ where: { id }, data: { isActive: active } });
  return { error: null };
}

/** Resolve a `?wh` query param to a valid warehouse id for this tenant, else the
 *  default warehouse. Guards against an arbitrary/foreign id from the URL.
 *  Pass `warehouses` (the result of a co-located `listWarehouses()` call) to
 *  skip a redundant second Warehouse query on the same page render. */
export async function resolveWarehouseId(
  wh: string | undefined,
  warehouses?: Array<{ id: string; isDefault: boolean }>,
): Promise<string> {
  const list =
    warehouses ??
    ((await db.warehouse.findMany({
      where: { tenantKey: TENANT_KEY },
      select: { id: true, isDefault: true },
    })) as Array<{ id: string; isDefault: boolean }>);
  if (wh && list.some((w) => w.id === wh)) return wh;
  return (list.find((w) => w.isDefault) ?? list[0])?.id ?? "";
}
