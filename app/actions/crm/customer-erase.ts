"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSolelyTheirs } from "@/lib/email/erasure";
import { releasePartLinesForEstimate } from "@/lib/fulfillment/reservations";
import { actorId } from "@/lib/wms-host";

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
 * A cheap deterministic token over the row counts, proving the operator is
 * acting on the person as they are right now. If anything is added between
 * looking and deleting, the token stops matching and the erase is refused —
 * nobody destroys an order that arrived after they last looked.
 *
 * The prefix records HOW the token was obtained. `eraseCustomer` insists on an
 * `exported` one whenever there is anything to lose, which is what makes the
 * download a real precondition rather than a button the UI could skip.
 */
function stateToken(
  userId: string,
  counts: Record<string, number>,
  origin: "preview" | "exported",
): string {
  const parts = Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`)
    .join(",");
  return `${origin}|${userId}|${parts}`;
}

async function countAttached(userId: string): Promise<Record<string, number>> {
  const [vehicles, repairOrders, deals, communications, tasks] = (await Promise.all([
    db.vehicle.count({ where: { ownerUserId: userId } }),
    db.repairOrder.count({ where: { userId } }),
    db.deal.count({ where: { customerUserId: userId } }),
    db.communicationLog.count({ where: { customerUserId: userId } }),
    // Held as an employee rather than as a client — counted so the panel can
    // show a master or manager what they actually own.
    db.crmTask.count({ where: { ownerUserId: userId } }),
  ])) as number[];
  return { vehicles, repairOrders, deals, communications, tasks };
}

/**
 * What deleting this person would take with them — shown BEFORE anything is
 * downloaded or typed, so the operator decides with the numbers in front of
 * them. Returns a `preview` token, which is enough to erase only when there is
 * nothing attached.
 */
export async function getEraseImpact(
  userId: string,
): Promise<Ok<{ counts: Record<string, number>; token: string; needsExport: boolean }> | Fail> {
  await requireRole(["ADMIN"]);

  const exists = await db.user.count({ where: { id: userId } });
  if (exists === 0) return { ok: false, error: "Пользователь не найден" };

  const counts = await countAttached(userId);
  const needsExport = Object.values(counts).some((n) => n > 0);
  return { ok: true, counts, token: stateToken(userId, counts, "preview"), needsExport };
}

export async function exportCustomerSnapshot(
  userId: string,
): Promise<Ok<{ snapshot: CustomerSnapshot; token: string }> | Fail> {
  await requireRole(["ADMIN"]);

  // EXPLICIT select, never `include`. Prisma returns every scalar column with
  // `include`, which put the customer's bcrypt `passwordHash` — plus their role
  // and internal flags — into a JSON file downloaded onto an operator's laptop.
  // A privacy export must carry only what the person is entitled to receive.
  const customer = (await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      referralSource: true,
      customerProfile: true,
      contacts: { select: { id: true, type: true, value: true, label: true } },
      customerNotes: { select: { id: true, body: true, createdAt: true } },
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
    token: stateToken(userId, counts, "exported"),
  };
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Remove the mail this person is the only outside party to.
 *
 * Mail is matched by address, and an address is a shared key: a thread where
 * they were one of several recipients is somebody else's correspondence too, so
 * deleting the row would take a supplier's or another customer's conversation
 * with it. Those stay in the mailbox — the same failure mode as an over-eager
 * stock release eating another estimate's hold.
 *
 * `InboxMessage` needs no such care: it holds one counterparty per row
 * (`fromEmail` inbound, `toEmail` outbound), so an address match there names
 * exactly this person.
 */
async function deleteMailFor(tx: TxClient, addresses: string[]): Promise<void> {
  if (addresses.length === 0) return;
  const known = new Set(addresses);

  const candidates = (await tx.emailMessage.findMany({
    where: {
      OR: [
        { fromEmail: { in: addresses } },
        { toEmails: { hasSome: addresses } },
        { ccEmails: { hasSome: addresses } },
      ],
    },
    select: { id: true, fromEmail: true, toEmails: true, ccEmails: true },
  })) as Array<{ id: string; fromEmail: string; toEmails: string[]; ccEmails: string[] }>;

  const solelyTheirs = candidates.filter((m) => isSolelyTheirs(m, known)).map((m) => m.id);

  if (solelyTheirs.length > 0) {
    await tx.emailMessage.deleteMany({ where: { id: { in: solelyTheirs } } });
  }
  await tx.inboxMessage.deleteMany({
    where: { OR: [{ fromEmail: { in: addresses } }, { toEmail: { in: addresses } }] },
  });
}

/**
 * Erase a customer.
 *
 * `deleteRelated` is the operator's explicit choice, defaulting to false:
 *
 *   false — personal data goes, the commercial record stays, detached. Right
 *           for a real customer: the revenue was the shop's, the repair order
 *           documents work on a car that may be sold, and both are kept by law
 *           for years. Deleting them would change last year's takings. The mail
 *           stays in the CRM mailbox for the same reason — it is the shop's own
 *           correspondence, and an operator looking up a past job expects to
 *           find the thread that produced it.
 *   true  — everything goes, including deals, estimates, orders, bookings and
 *           the mail. Right for a mistake: a duplicate, a test row, a lead that
 *           went nowhere. Stock reservations are released first.
 *
 * Either way the customer CARD goes, and with it the card's own timeline
 * (`CommunicationLog`), whose FK requires a customer to belong to.
 *
 * An earlier version decided this automatically ("keep if there are deals"),
 * which was both unpredictable for the operator and wrong in practice: every
 * deal gets an estimate the moment it is created (`createDeal` makes both in
 * one transaction), so "has an estimate" says nothing about whether the deal
 * ever mattered.
 */
export async function eraseCustomer(
  userId: string,
  confirmation: string,
  token: string,
  options: { deleteRelated?: boolean } = {},
): Promise<Ok<{ erased: Record<string, number> }> | Fail> {
  const session = await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      isCustomer: true,
      isSupplier: true,
      permissionRole: true,
    },
  })) as {
    id: string;
    email: string | null;
    phone: string | null;
    isCustomer: boolean;
    isSupplier: boolean;
    permissionRole: string;
  } | null;
  if (!target) return { ok: false, error: "Клиент не найден" };
  if (target.id === session.id) return { ok: false, error: "Нельзя удалить собственный аккаунт" };
  if (target.permissionRole === "ADMIN") {
    return { ok: false, error: "Нельзя стереть администратора — сначала снимите роль" };
  }
  // Staff go through here too: a master is the same User row as a client, only
  // with a different role, and refusing them left no way to remove one at all.
  // What differs is which links they have — an employee owns tasks, authors
  // logs and is named as master on repair orders — and those are all SetNull or
  // handled below, so nothing of theirs is destroyed unasked.
  //
  // Suppliers stay out: `SupplierOrder.userId` is a required link this flow
  // does not unpick, so erasing one would fail mid-transaction anyway.
  // A person can be flagged both customer and supplier. `SupplierOrder.userId`
  // is Restrict, so such a row passes every gate above and then dies on a raw
  // foreign-key error inside the transaction — after the operator has already
  // exported the snapshot and retyped the address. Refuse readably instead.
  if (target.isSupplier) {
    return {
      ok: false,
      error: "Этот клиент одновременно поставщик — сначала снимите роль поставщика.",
    };
  }

  const expected = (target.email ?? target.phone ?? "").trim().toLowerCase();
  if (!expected) return { ok: false, error: "У клиента нет email или телефона — подтвердить невозможно" };
  if (confirmation.trim().toLowerCase() !== expected) {
    return { ok: false, error: "Подтверждение не совпадает" };
  }

  // Re-derive from CURRENT data: if anything arrived since the operator looked,
  // the counts differ and we stop rather than destroy something unseen.
  const counts = await countAttached(userId);
  const hasData = Object.values(counts).some((n) => n > 0);

  // Every address this person is known by — the login address plus any verified
  // alias — so their mail is found however it reached us.
  const aliasRows = (await db.customerContact.findMany({
    where: { userId, type: "EMAIL" },
    select: { value: true },
  })) as Array<{ value: string }>;
  const addresses = [target.email, ...aliasRows.map((a) => a.value)]
    .filter((a): a is string => typeof a === "string" && a.length > 0)
    .map((a) => a.toLowerCase());

  // A preview token is enough for an empty record — there is nothing to export.
  // Anything with data demands the `exported` token, so the copy really was
  // downloaded and this cannot be reduced to a single careless click.
  const accepted = hasData
    ? [stateToken(userId, counts, "exported")]
    : [stateToken(userId, counts, "exported"), stateToken(userId, counts, "preview")];

  if (!accepted.includes(token)) {
    return {
      ok: false,
      error: hasData
        ? "Данные изменились с момента выгрузки — выгрузите копию заново."
        : "Данные изменились — откройте удаление заново.",
    };
  }

  const deleteRelated = options.deleteRelated === true;

  await db.$transaction(
    async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      // Revoke the guest links FIRST, on either branch. `Deal.claimToken` is not
      // just a read capability: customer-estimates.ts accepts it to APPROVE or
      // DECLINE an estimate, so a link mailed to someone being erased would
      // otherwise let them keep acting on the deal.
      await tx.deal.updateMany({
        where: { customerUserId: userId },
        data: { claimToken: null },
      });
      await tx.repairOrder.updateMany({ where: { userId }, data: { claimToken: null } });

      // ── What they held as a CLIENT ─────────────────────────────────────
      if (deleteRelated) {
        // Everything goes. Release the stock holds first — they are keyed by a
        // string, not a foreign key, so no cascade can free them and the
        // reserved quantity would stay inflated forever.
        const estimates = (await tx.estimate.findMany({
          where: { deal: { customerUserId: userId } },
          select: { id: true },
        })) as Array<{ id: string }>;
        for (const est of estimates) {
          await releasePartLinesForEstimate(tx, est.id, actorId(session));
        }
        // Deleting the deals cascades their estimates, repair orders, job lines,
        // slots, work photos, shipments and bookings.
        await tx.deal.deleteMany({ where: { customerUserId: userId } });
        // Repair orders created outside a deal, if any, have no parent to take
        // them; remove them explicitly.
        await tx.repairOrder.deleteMany({ where: { userId } });
        await tx.vehicle.deleteMany({ where: { ownerUserId: userId } });
      } else {
        // The commercial and service record is DETACHED, not destroyed. A deal
        // still totals and a repair order still documents work on a car that may
        // be sold; both are kept for accounting and warranty long after a person
        // asks to be removed.
        await tx.deal.updateMany({
          where: { customerUserId: userId },
          data: { customerUserId: null },
        });
        await tx.repairOrder.updateMany({ where: { userId }, data: { userId: null } });
        // Cars with nothing attached are pure profile data and can go; the rest
        // keep their history and simply lose their owner.
        await tx.vehicle.deleteMany({
          where: {
            ownerUserId: userId,
            repairOrders: { none: {} },
            rentalBookings: { none: {} },
            deals: { none: {} },
          },
        });
        await tx.vehicle.updateMany({
          where: { ownerUserId: userId },
          data: { ownerUserId: null },
        });
      }
      // ── What they held as an EMPLOYEE ──────────────────────────────────
      // A different set of links entirely, so it gets its own answer. Ticked,
      // the queue goes with the person. Left alone, the tasks survive
      // unassigned (the FK is SetNull) and a manager reassigns them — losing
      // the payment reminders because someone left would be worse than a row
      // with an empty owner. Everything else they touched — authored logs,
      // master on an order, technician on a labour line, uploaded photos,
      // prepared estimates — is SetNull in the schema and simply loses a name.
      if (deleteRelated) {
        await tx.crmTask.deleteMany({ where: { ownerUserId: userId } });
      }

      // The mail itself belongs to the shop's mailbox, not to the customer
      // card, so it goes only on the branch that removes the commercial record
      // too. Detaching a real customer leaves the correspondence where an
      // operator expects to find it — the same reasoning that keeps their deals
      // and repair orders. Staff addresses are skipped entirely: mail to and
      // from a company mailbox is the shop's own correspondence, never one
      // person's to take away.
      if (deleteRelated && target.isCustomer) await deleteMailFor(tx, addresses);
      // The card's own timeline always goes: CommunicationLog REQUIRES a
      // customer (the FK is not nullable), so there is no one left to own it.
      await tx.communicationLog.deleteMany({ where: { customerUserId: userId } });
      // Profile, contacts, notes, tags, notifications and loyalty hang off the
      // row by ON DELETE CASCADE and go with it.
      await tx.user.delete({ where: { id: userId } });
    },
  );

  revalidatePath("/admin/customers");
  revalidatePath("/admin/users");
  return { ok: true, erased: counts };
}
