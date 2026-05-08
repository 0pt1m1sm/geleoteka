/**
 * Server-only read helpers for /admin/customers. NOT a `"use server"` file —
 * these functions return data, not mutations, so they belong in a regular
 * module that page components / route handlers import directly.
 *
 * Auth is enforced at the calling page; helpers themselves are unauthed.
 */

import "server-only";
import { db } from "@/lib/db";
import {
  applyClientSort,
  applyTextFilter,
  type CustomerListFilter,
} from "@/lib/customer-filters";
import type { CustomerListViewModel } from "@/lib/customer-csv";

export interface CustomerTagOption {
  id: string;
  name: string;
  colorSlug: string;
}

/** Alphabetical list of all CRM tags — used in filter dropdown and tag picker. */
export async function getAllCustomerTags(): Promise<CustomerTagOption[]> {
  const rows = (await db.customerTag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, colorSlug: true },
  })) as CustomerTagOption[];
  return rows;
}

interface RawCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: Date;
  vehicles: { model: string; year: number }[];
  loyaltyAccount: { points: number } | null;
  _count: { repairOrders: number };
  repairOrders: { dateTime: Date }[];
  customerProfile: { blacklisted: boolean } | null;
  tagAssignments: { tag: { id: string; name: string; colorSlug: string } }[];
}

/**
 * Load customers for the list view + CSV export. WHERE applies tag and
 * blacklist filters at SQL; text filter and sort run on the in-memory rows
 * (documented Out-of-Scope: denormalized lastVisitAt, JS sort scales to ≤5000).
 */
export async function loadCustomersForList(
  filter: CustomerListFilter,
): Promise<CustomerListViewModel[]> {
  const where: Record<string, unknown> = {
    isCustomer: true,
    permissionRole: { in: ["CLIENT", "NONE"] as const },
  };

  if (filter.tagId) {
    where.tagAssignments = { some: { tagId: filter.tagId } };
  }

  if (filter.blacklist === "only") {
    where.customerProfile = { is: { blacklisted: true } };
  } else if (filter.blacklist === "hide") {
    // Defense-in-depth: include customers with no profile row alongside
    // explicitly-not-blacklisted ones. Backfill in migration should have
    // covered every existing customer, but we keep the OR for safety.
    where.OR = [
      { customerProfile: { is: { blacklisted: false } } },
      { customerProfile: null },
    ];
  }

  const raw = (await db.user.findMany({
    where,
    include: {
      vehicles: {
        where: { ownershipType: "CUSTOMER" },
        select: { model: true, year: true },
      },
      loyaltyAccount: { select: { points: true } },
      _count: { select: { repairOrders: true } },
      repairOrders: {
        take: 1,
        orderBy: { dateTime: "desc" },
        select: { dateTime: true },
      },
      customerProfile: { select: { blacklisted: true } },
      tagAssignments: {
        include: {
          tag: { select: { id: true, name: true, colorSlug: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })) as unknown as RawCustomer[];

  const mapped: CustomerListViewModel[] = raw.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    createdAt: u.createdAt,
    lastVisitAt: u.repairOrders[0]?.dateTime ?? null,
    points: u.loyaltyAccount?.points ?? 0,
    visitCount: u._count.repairOrders,
    vehicles: u.vehicles,
    tags: u.tagAssignments.map((a) => a.tag),
    blacklisted: u.customerProfile?.blacklisted ?? false,
  }));

  const filtered = applyTextFilter(mapped, filter.q);
  return applyClientSort(filtered, filter.sort);
}
