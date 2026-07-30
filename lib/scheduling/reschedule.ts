/**
 * Moving an existing booking to a new time.
 *
 * The rule this encodes: a repair order and its calendar slot must always agree
 * about when the car is due, so they move together in one transaction or not at
 * all. Double-booking is decided by the `Slot.dateTime` unique constraint rather
 * than a pre-check — a pre-check would still lose a race with the customer
 * booking wizard, which writes to the same table.
 *
 * Kept out of the server action (which owns auth, form parsing and the Russian
 * copy) so the decision logic is testable without a database, matching the
 * lib+port+fake pattern used by the warehouse and email code.
 */

type QueryArgs = Record<string, unknown>;
export type DbRow = Record<string, unknown>;

/** The delegate surface a reschedule needs, inside or outside a transaction. */
export interface RescheduleTx {
  repairOrder: {
    findUnique(args: QueryArgs): Promise<DbRow | null>;
    update(args: QueryArgs): Promise<DbRow>;
  };
  slot: {
    findUnique(args: QueryArgs): Promise<DbRow | null>;
    update(args: QueryArgs): Promise<DbRow>;
    create(args: QueryArgs): Promise<DbRow>;
  };
}

export interface ReschedulePort extends RescheduleTx {
  $transaction<T>(fn: (tx: RescheduleTx) => Promise<T>): Promise<T>;
}

export type RescheduleOutcome =
  | { ok: true }
  /** No such repair order. */
  | { ok: false; reason: "not-found" }
  /** Cancelled orders hold no slot and must be reopened before being moved. */
  | { ok: false; reason: "cancelled" }
  /** Another booking already owns that instant. */
  | { ok: false; reason: "conflict" };

/** Postgres unique-violation, however Prisma surfaces it. */
export function isUniqueViolation(err: unknown): boolean {
  const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
  return code === "P2002" || (err instanceof Error && err.message.includes("Unique constraint"));
}

export async function applyReschedule(
  repairOrderId: string,
  next: Date,
  client: ReschedulePort,
): Promise<RescheduleOutcome> {
  const ro = (await client.repairOrder.findUnique({
    where: { id: repairOrderId },
    select: { status: true },
  })) as { status: string } | null;

  if (!ro) return { ok: false, reason: "not-found" };
  if (ro.status === "CANCELLED") return { ok: false, reason: "cancelled" };

  try {
    await client.$transaction(async (tx) => {
      await tx.repairOrder.update({ where: { id: repairOrderId }, data: { dateTime: next } });

      // A cancelled-then-reopened order lost its slot when it was cancelled, so
      // re-create rather than assume there is one to move.
      const slot = await tx.slot.findUnique({ where: { repairOrderId } });
      if (slot) {
        await tx.slot.update({ where: { repairOrderId }, data: { dateTime: next } });
      } else {
        await tx.slot.create({ data: { repairOrderId, dateTime: next } });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "conflict" };
    throw err;
  }

  return { ok: true };
}
