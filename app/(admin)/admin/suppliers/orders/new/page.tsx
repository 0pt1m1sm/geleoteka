export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SupplierOrderForm } from "@/components/admin/SupplierOrderForm";
import type { ItemRow } from "@/components/admin/supplier-order-form/types";

const PREFILL_MAX_ENTRIES = 100;
const PREFILL_MAX_QTY = 9999;

/** Parse the user-controlled `?prefill=partId:qty,...` param into pre-filled PART
 *  lines. Defensive: caps entries, clamps qty to 1..9999, drops unknown parts. */
function parsePrefill(
  prefill: string | string[] | undefined,
  partsById: Map<string, { name: string }>,
): ItemRow[] {
  // A repeated query key (?prefill=a:1&prefill=b:2) arrives as string[]; flatten
  // it so we never call .split on a non-string and crash the page.
  const raw = Array.isArray(prefill) ? prefill.join(",") : prefill;
  if (!raw) return [];
  const rows: ItemRow[] = [];
  for (const entry of raw.split(",").slice(0, PREFILL_MAX_ENTRIES)) {
    const [partId, qtyRaw] = entry.split(":");
    if (!partId) continue;
    const part = partsById.get(partId);
    if (!part) continue;
    const qty = parseInt(qtyRaw, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > PREFILL_MAX_QTY) continue;
    rows.push({ type: "PART", partId, description: part.name, quantity: qty, unitCost: 0 });
  }
  return rows;
}

interface Props {
  searchParams: Promise<{ prefill?: string | string[] }>;
}

export default async function NewSupplierOrderPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const [suppliers, parts] = await Promise.all([
    db.user.findMany({
      where: { isSupplier: true, supplierProfile: { isActive: true } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.part.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, article: true, price: true, weightGrams: true },
    }),
  ]);

  const supplierOptions = suppliers.map((s: Record<string, unknown>) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  const partOptions = parts.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: p.name as string,
    article: p.article as string,
    price: p.price as number,
    weightGrams: (p.weightGrams as number | null) ?? null,
  }));

  const { prefill } = await searchParams;
  const initialItems = parsePrefill(prefill, new Map(partOptions.map((p) => [p.id, { name: p.name }])));

  if (supplierOptions.length === 0) {
    return (
      <div className="max-w-2xl">
        <Link
          href="/admin/suppliers/orders"
          className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-block mb-2"
        >
          ← Заказы поставщикам
        </Link>
        <h1 className="text-display text-2xl font-bold mb-6">Новый заказ поставщику</h1>
        <div className="card text-center py-12 space-y-4">
          <p className="text-[var(--foreground-muted)]">
            Сначала добавьте хотя бы одного поставщика, чтобы оформить заказ.
          </p>
          <Link href="/admin/suppliers/new" className="btn btn-primary text-sm inline-block">
            + Добавить поставщика
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/suppliers/orders"
        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-block mb-2"
      >
        ← Заказы поставщикам
      </Link>
      <h1 className="text-display text-2xl font-bold mb-6">Новый заказ поставщику</h1>
      <SupplierOrderForm suppliers={supplierOptions} parts={partOptions} initialItems={initialItems} />
    </div>
  );
}
