/**
 * Backfill: every PartOrder / RentalBooking must carry a non-null dealId
 * BEFORE the NOT NULL migration (Task 2) and BEFORE RentalBooking.totalCost
 * is dropped (Task 5).
 *
 * For each orphan row (dealId IS NULL) it synthesizes a Deal + initial DRAFT
 * estimate via the same `createDeal` the live flows use, reconstructing the
 * estimate lines from the row's denormalized fields so no money is lost when
 * the column is later dropped:
 *   - RentalBooking → channel RENTAL, one RENTAL_DAY line = totalCost
 *   - PartOrder     → channel PARTS_RETAIL, one PART line per PartOrderItem
 * The customer is resolved through `findOrCreateGuestCustomer` (the canonical
 * guest resolver) so guest rows without a userId still get a customer.
 *
 * Idempotent: only rows with dealId IS NULL are processed; re-running is a
 * no-op once every row is linked. Rows whose customer cannot be resolved
 * (invalid contact email/phone) are SKIPPED and reported — they remain NULL
 * and must be resolved manually before Task 2's NOT NULL flip.
 *
 * Run: `npm run backfill-fulfillment-deals`. Reports final NULL counts.
 *
 * NOTE: a one-off pre-migration script. Run it on a target DB BEFORE applying
 * the Task 2 NOT NULL migration there (it links every orphan first). Writes use
 * `db.partShipment` (table still "PartOrder" via @@map); orphan-finding uses raw
 * SQL so it works whether or not the dealId column is still nullable.
 */

import "dotenv/config";
import { db } from "../lib/db";
import { createDeal } from "../lib/crm/public";
import { findOrCreateGuestCustomer } from "../lib/customer-onboarding";

interface BackfillOutcome {
  processed: number;
  skipped: Array<{ id: string; reason: string }>;
}

async function backfillRentalBookings(): Promise<BackfillOutcome> {
  // Raw query: the typed client declares dealId NOT NULL (post-Task-2), so a
  // `where: { dealId: null }` filter won't type-check. A pre-migration backfill
  // must find orphans regardless of the committed schema's nullability.
  const orphans = (await db.$queryRawUnsafe(
    `SELECT id, "bookingNumber", "userId", "totalCost", "contactName", "contactEmail", "contactPhone"
     FROM "RentalBooking" WHERE "dealId" IS NULL`,
  )) as Array<{
    id: string;
    bookingNumber: string | null;
    userId: string | null;
    totalCost: number;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  }>;

  const outcome: BackfillOutcome = { processed: 0, skipped: [] };

  for (const b of orphans) {
    const guest = await findOrCreateGuestCustomer({
      sessionUserId: b.userId,
      name: b.contactName,
      email: b.contactEmail,
      phone: b.contactPhone,
    });
    if (!guest.ok) {
      outcome.skipped.push({ id: b.id, reason: `customer unresolved: ${guest.error}` });
      continue;
    }

    const deal = await createDeal({
      customerUserId: guest.userId,
      channel: "RENTAL",
      source: "backfill",
      initialStage: "IN_PROGRESS",
      lines: [
        {
          type: "RENTAL_DAY",
          description: `Аренда (восстановлено)${b.bookingNumber ? ` ${b.bookingNumber}` : ""}`,
          qty: 1,
          unitPrice: b.totalCost,
        },
      ],
    });

    await db.rentalBooking.update({ where: { id: b.id }, data: { dealId: deal.id } });
    outcome.processed += 1;
  }

  return outcome;
}

async function backfillPartOrders(): Promise<BackfillOutcome> {
  // Raw query for the same nullability reason as backfillRentalBookings.
  const orphanRows = (await db.$queryRawUnsafe(
    `SELECT id, "orderNumber", "userId", "contactName", "contactEmail", "contactPhone", notes
     FROM "PartOrder" WHERE "dealId" IS NULL`,
  )) as Array<{
    id: string;
    orderNumber: string | null;
    userId: string | null;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    notes: string | null;
  }>;

  // Items per orphan order (no null filter needed — fetched by orderId).
  const orphanIds = orphanRows.map((o) => o.id);
  const itemRows =
    orphanIds.length === 0
      ? []
      : ((await db.partOrderItem.findMany({
          where: { orderId: { in: orphanIds } },
          select: { orderId: true, partId: true, quantity: true, unitPrice: true },
        })) as Array<{ orderId: string; partId: string; quantity: number; unitPrice: number }>);
  const itemsByOrder = new Map<string, Array<{ partId: string; quantity: number; unitPrice: number }>>();
  for (const it of itemRows) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push({ partId: it.partId, quantity: it.quantity, unitPrice: it.unitPrice });
    itemsByOrder.set(it.orderId, list);
  }
  const orphans = orphanRows.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] }));

  const outcome: BackfillOutcome = { processed: 0, skipped: [] };

  // Resolve part names once for readable line descriptions.
  const allPartIds = Array.from(new Set(orphans.flatMap((o) => o.items.map((i) => i.partId))));
  const parts = (await db.part.findMany({
    where: { id: { in: allPartIds } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  const partName = new Map(parts.map((p) => [p.id, p.name]));

  for (const o of orphans) {
    const guest = await findOrCreateGuestCustomer({
      sessionUserId: o.userId,
      name: o.contactName,
      email: o.contactEmail,
      phone: o.contactPhone,
    });
    if (!guest.ok) {
      outcome.skipped.push({ id: o.id, reason: `customer unresolved: ${guest.error}` });
      continue;
    }

    const deal = await createDeal({
      customerUserId: guest.userId,
      channel: "PARTS_RETAIL",
      source: "backfill",
      initialStage: "IN_PROGRESS",
      notes: o.notes ?? null,
      lines: o.items.map((item) => ({
        type: "PART" as const,
        description: partName.get(item.partId) ?? "Запчасть (восстановлено)",
        qty: item.quantity,
        unitPrice: item.unitPrice,
        partId: item.partId,
      })),
    });

    await db.partShipment.update({ where: { id: o.id }, data: { dealId: deal.id } });
    outcome.processed += 1;
  }

  return outcome;
}

async function main(): Promise<void> {
  console.log("[backfill-fulfillment-deals] starting");

  const rentals = await backfillRentalBookings();
  console.log(`  RentalBooking: linked ${rentals.processed}, skipped ${rentals.skipped.length}`);
  rentals.skipped.forEach((s) => console.warn(`    SKIP RentalBooking ${s.id}: ${s.reason}`));

  const partOrders = await backfillPartOrders();
  console.log(`  PartOrder: linked ${partOrders.processed}, skipped ${partOrders.skipped.length}`);
  partOrders.skipped.forEach((s) => console.warn(`    SKIP PartOrder ${s.id}: ${s.reason}`));

  // Verification — prove zero NULLs remain (the Task 2 migration gate).
  // Raw count for the same nullability reason as the orphan queries above.
  const [poRows, rbRows] = (await Promise.all([
    db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PartOrder" WHERE "dealId" IS NULL`),
    db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "RentalBooking" WHERE "dealId" IS NULL`),
  ])) as [Array<{ n: number }>, Array<{ n: number }>];
  const poNull = poRows[0]?.n ?? 0;
  const rbNull = rbRows[0]?.n ?? 0;

  console.log(`[backfill-fulfillment-deals] remaining NULL dealId — PartOrder: ${poNull}, RentalBooking: ${rbNull}`);
  if (poNull > 0 || rbNull > 0) {
    console.warn(
      "[backfill-fulfillment-deals] WARNING: NULL dealId rows remain (see SKIP lines above). " +
        "Resolve them before applying the Task 2 NOT NULL migration.",
    );
  } else {
    console.log("[backfill-fulfillment-deals] PASS — zero NULL dealId rows. Safe for Task 2.");
  }
}

main()
  .catch((err) => {
    console.error("[backfill-fulfillment-deals] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
