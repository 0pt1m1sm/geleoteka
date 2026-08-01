/**
 * Transactional allocation of physical workshop bays.
 *
 * Every booking/reschedule locks the active ServiceBay rows before inspecting
 * Slot. PostgreSQL READ COMMITTED then gives the following Slot query a fresh
 * snapshot after a competing allocator commits. This closes the race that a
 * plain "find a free bay, then insert" check would leave open for overlapping
 * starts (for example 12:00 and 13:00).
 *
 * Slot's compound unique key (dateTime, bayId) remains the independent database
 * backstop for exact-start collisions and writers that bypass this allocator.
 */

import { TENANT_KEY } from "@/lib/tenant";
import { SLOT_MINUTES } from "@/lib/scheduling/availability";

type QueryArgs = Record<string, unknown>;
export type SchedulingRow = Record<string, unknown>;

export interface ServiceBayAllocationTx {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  slot: {
    findMany(args: QueryArgs): Promise<SchedulingRow[]>;
    create(args: QueryArgs): Promise<SchedulingRow>;
  };
}

export class NoServiceBayAvailable extends Error {
  constructor() {
    super("NO_SERVICE_BAY_AVAILABLE");
    this.name = "NoServiceBayAvailable";
  }
}

export const SERVICE_BAY_CONFLICT_MESSAGE =
  "Все рабочие посты на это время уже заняты. Выберите другое время.";

/** Prisma/Postgres can surface the compound unique violation in either shape. */
export function isServiceBayAllocationConflict(error: unknown): boolean {
  if (error instanceof NoServiceBayAvailable) return true;
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2002" ||
    (error instanceof Error && error.message.includes("Unique constraint"));
}

interface LockedBay {
  id: string;
}

/**
 * Lock the resource pool in stable order. The second statement in this
 * transaction will see slots committed by an allocator that held the lock
 * before us; doing the availability predicate inside this SELECT would retain
 * the older statement snapshot while waiting.
 */
export async function lockActiveServiceBays(
  tx: ServiceBayAllocationTx,
): Promise<LockedBay[]> {
  return tx.$queryRawUnsafe<LockedBay[]>(
    `SELECT "id"
       FROM "ServiceBay"
      WHERE "tenantKey" = $1 AND "isActive" = true
      ORDER BY "sortOrder" ASC, "id" ASC
      FOR UPDATE`,
    TENANT_KEY,
  );
}

export async function chooseAvailableServiceBay(
  tx: ServiceBayAllocationTx,
  dateTime: Date,
  options: { excludeRepairOrderId?: string; slotMinutes?: number } = {},
): Promise<string> {
  const bays = await lockActiveServiceBays(tx);
  if (bays.length === 0) throw new NoServiceBayAvailable();

  const slotMs = (options.slotMinutes ?? SLOT_MINUTES) * 60_000;
  const overlapping = (await tx.slot.findMany({
    where: {
      bayId: { in: bays.map((bay) => bay.id) },
      ...(options.excludeRepairOrderId
        ? { repairOrderId: { not: options.excludeRepairOrderId } }
        : {}),
      dateTime: {
        gt: new Date(dateTime.getTime() - slotMs),
        lt: new Date(dateTime.getTime() + slotMs),
      },
    },
    select: { bayId: true },
  })) as Array<{ bayId: string }>;

  const occupied = new Set(overlapping.map((slot) => slot.bayId));
  const available = bays.find((bay) => !occupied.has(bay.id));
  if (!available) throw new NoServiceBayAvailable();
  return available.id;
}

/** Reserve one active bay. Must be called inside the transaction that creates
 * the RepairOrder so a failed reservation rolls the order back with it. */
export async function reserveServiceBaySlot(
  tx: ServiceBayAllocationTx,
  input: { repairOrderId: string; dateTime: Date; slotMinutes?: number },
): Promise<{ bayId: string }> {
  const bayId = await chooseAvailableServiceBay(tx, input.dateTime, {
    slotMinutes: input.slotMinutes,
  });
  await tx.slot.create({
    data: { dateTime: input.dateTime, repairOrderId: input.repairOrderId, bayId },
    select: { id: true },
  });
  return { bayId };
}
