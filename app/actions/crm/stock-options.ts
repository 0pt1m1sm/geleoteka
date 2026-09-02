"use server";

import { tenantDb } from "@/lib/tenant/scoped-db";
import { requireRole } from "@/lib/auth";
import { availableStock } from "@/lib/wms/public";

export interface PartStockOption {
  id: string;
  name: string;
  article: string;
  price: number;
  available: number;
  /** Состояние. Без него б/у экземпляр в пикере неотличим от нового: артикул у
   *  них ОДИН И ТОТ ЖЕ (так задумано схемой), а поиск идёт в том числе по нему.
   *  Механик, ищущий по OEM, получал несколько почти одинаковых строк и выбирал
   *  наугад — в смету уходила не та деталь и не та цена. */
  condition: "NEW" | "USED" | "REFURBISHED";
  /** Различает ДВА б/у экземпляра одной детали: у них совпадает и артикул, и
   *  название, и состояние — не совпадает только sku. */
  sku: string;
  /** Заметка о состоянии: единственное, чем один экземпляр отличается от
   *  другого по существу. */
  conditionNote: string | null;
}

/**
 * Datasource for the estimate PART-line picker: active catalog parts with their
 * available stock (on-hand − reserved), searchable by name or article. Capped
 * so the whole catalog never loads.
 */
export async function searchPartStockOptions(query: string): Promise<PartStockOption[]> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
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
      condition: true,
      sku: true,
      conditionNote: true,
      stockItems: { select: { quantity: true, reserved: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  })) as Array<{
    id: string;
    name: string;
    article: string;
    price: number;
    condition: "NEW" | "USED" | "REFURBISHED";
    sku: string;
    conditionNote: string | null;
    stockItems: Array<{ quantity: number; reserved: number }>;
  }>;

  return parts.map((p) => ({
    id: p.id,
    name: p.name,
    article: p.article,
    price: p.price,
    available: p.stockItems[0] ? availableStock(p.stockItems[0]) : 0,
    condition: p.condition,
    sku: p.sku,
    conditionNote: p.conditionNote,
  }));
}
