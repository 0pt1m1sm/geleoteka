"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { availableStock } from "@/lib/wms/public";

export interface PartStockOption {
  id: string;
  name: string;
  article: string;
  price: number;
  available: number;
}

/**
 * Datasource for the estimate PART-line picker: active catalog parts with their
 * available stock (on-hand − reserved), searchable by name or article. Capped
 * so the whole catalog never loads.
 */
export async function searchPartStockOptions(query: string): Promise<PartStockOption[]> {
  await requireRole(["ADMIN", "MANAGER"]);
  const q = query.trim();

  const parts = (await db.part.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { article: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      article: true,
      price: true,
      stockItem: { select: { quantity: true, reserved: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  })) as Array<{
    id: string;
    name: string;
    article: string;
    price: number;
    stockItem: { quantity: number; reserved: number } | null;
  }>;

  return parts.map((p) => ({
    id: p.id,
    name: p.name,
    article: p.article,
    price: p.price,
    available: p.stockItem ? availableStock(p.stockItem) : 0,
  }));
}
