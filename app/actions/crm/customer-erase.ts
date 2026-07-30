"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Erasing a customer together with their entire history.
 *
 * This is the deliberate, destructive counterpart to archiving. It exists
 * because archived rubbish would otherwise accumulate with no way to clear it,
 * and because a business sometimes genuinely must remove a person's data.
 *
 * Three things make it safe enough to exist:
 *
 *   1. A snapshot must be exported first. `eraseCustomer` refuses unless the
 *      caller passes back the exact `snapshotToken` returned by
 *      `exportCustomerSnapshot`, so nobody can erase a customer they have not
 *      downloaded a copy of.
 *   2. The operator retypes the customer's email or phone.
 *   3. The deletion is EXPLICIT, not an implicit `ON DELETE CASCADE`. The root
 *      FKs are RESTRICT precisely so that only this function — which names every
 *      table it destroys, in dependency order, inside one transaction — can do
 *      it. A stray `user.delete()` anywhere else still fails.
 */

type Ok<T extends object = object> = { ok: true } & T;
type Fail = { ok: false; error: string };

export interface CustomerSnapshot {
  exportedAt: string;
  customer: Record<string, unknown>;
  vehicles: unknown[];
  repairOrders: unknown[];
  deals: unknown[];
  communications: unknown[];
  counts: Record<string, number>;
}

/**
 * A cheap deterministic token over the row counts, proving the snapshot the
 * operator holds describes the customer as they are right now. If anything is
 * added between export and erase the token stops matching and the erase is
 * refused, so nobody destroys an order that arrived after the download.
 */
function snapshotToken(userId: string, counts: Record<string, number>): string {
  const parts = Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`)
    .join(",");
  return `${userId}|${parts}`;
}

export async function exportCustomerSnapshot(
  userId: string,
): Promise<Ok<{ snapshot: CustomerSnapshot; token: string }> | Fail> {
  await requireRole(["ADMIN"]);

  const customer = (await db.user.findUnique({
    where: { id: userId },
    include: {
      customerProfile: true,
      contacts: true,
      customerNotes: true,
    },
  })) as Record<string, unknown> | null;
  if (!customer) return { ok: false, error: "Клиент не найден" };

  const [vehicles, repairOrders, deals, communications] = await Promise.all([
    db.vehicle.findMany({ where: { ownerUserId: userId } }),
    db.repairOrder.findMany({
      where: { userId },
      include: { jobLines: true, slot: true },
    }),
    db.deal.findMany({
      where: { customerUserId: userId },
      include: { estimates: { include: { estimateLines: true } } },
    }),
    db.communicationLog.findMany({ where: { customerUserId: userId } }),
  ]);

  const counts = {
    vehicles: (vehicles as unknown[]).length,
    repairOrders: (repairOrders as unknown[]).length,
    deals: (deals as unknown[]).length,
    communications: (communications as unknown[]).length,
  };

  return {
    ok: true,
    snapshot: {
      // Stamped server-side so the file records when the copy was actually taken.
      exportedAt: new Date().toISOString(),
      customer,
      vehicles: vehicles as unknown[],
      repairOrders: repairOrders as unknown[],
      deals: deals as unknown[],
      communications: communications as unknown[],
      counts,
    },
    token: snapshotToken(userId, counts),
  };
}

export async function eraseCustomer(
  userId: string,
  confirmation: string,
  token: string,
): Promise<Ok<{ erased: Record<string, number> }> | Fail> {
  const session = await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      isCustomer: true,
      permissionRole: true,
    },
  })) as {
    id: string;
    email: string | null;
    phone: string | null;
    isCustomer: boolean;
    permissionRole: string;
  } | null;
  if (!target) return { ok: false, error: "Клиент не найден" };
  if (target.id === session.id) return { ok: false, error: "Нельзя удалить собственный аккаунт" };
  if (target.permissionRole === "ADMIN") {
    return { ok: false, error: "Нельзя стереть администратора — сначала снимите роль" };
  }

  const expected = (target.email ?? target.phone ?? "").trim().toLowerCase();
  if (!expected) return { ok: false, error: "У клиента нет email или телефона — подтвердить невозможно" };
  if (confirmation.trim().toLowerCase() !== expected) {
    return { ok: false, error: "Подтверждение не совпадает" };
  }

  // Re-derive the token from CURRENT data: if a new order or message arrived
  // after the operator downloaded their copy, the counts differ and we stop.
  const [vehicles, repairOrders, deals, communications] = await Promise.all([
    db.vehicle.count({ where: { ownerUserId: userId } }),
    db.repairOrder.count({ where: { userId } }),
    db.deal.count({ where: { customerUserId: userId } }),
    db.communicationLog.count({ where: { customerUserId: userId } }),
  ]);
  const counts = { vehicles, repairOrders, deals, communications };
  if (snapshotToken(userId, counts) !== token) {
    return {
      ok: false,
      error: "Данные клиента изменились после выгрузки. Выгрузите копию заново.",
    };
  }

  await db.$transaction(
    async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      // Order matters: children before parents, and RepairOrder before Deal
      // because an order points at its deal. The aggregate-internal cascades
      // (RepairOrder → JobLine/Slot, Deal → Estimate → EstimateLine) still do
      // their part, so only these four roots are named here.
      await tx.communicationLog.deleteMany({ where: { customerUserId: userId } });
      await tx.repairOrder.deleteMany({ where: { userId } });
      await tx.deal.deleteMany({ where: { customerUserId: userId } });
      await tx.vehicle.deleteMany({ where: { ownerUserId: userId } });
      // Everything else hanging off the person (profile, contacts, notes, tags,
      // notifications, loyalty) is ON DELETE CASCADE and goes with this row.
      await tx.user.delete({ where: { id: userId } });
    },
  );

  revalidatePath("/admin/customers");
  revalidatePath("/admin/users");
  return { ok: true, erased: counts };
}
