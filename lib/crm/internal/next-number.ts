import { tenantDb, type TenantDb } from "@/lib/tenant/scoped-db";
import type { PrismaClient } from "@/app/generated/prisma/client";

/**
 * Human-readable sequential numbers for Deal / Estimate / RepairOrder.
 *
 * Счётчик — НА АРЕНДАТОРА (`TenantCounter`), а не общая последовательность:
 * у второго сервиса номера продолжались бы с наших, и первый его наряд
 * оказался бы RO-0412 — странно выглядит и выдаёт чужой масштаб.
 *
 * Арендатор берётся из настройки соединения, той же, по которой работает
 * изоляция строк. Если её нет, вставка падает на внешнем ключе — и это
 * правильно: номер, выданный неизвестно кому, хуже отказа.
 *
 * Гонка исключена одним оператором: INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING берёт замок на строку счётчика, поэтому два одновременных
 * создания получают разные номера. Значение расходуется даже при откате
 * транзакции — номера допускают пропуски, это идентификаторы, а не счёт строк.
 *
 * Format: `<PREFIX>-NNNN` zero-padded to 4 digits, growing past that
 * width once we cross 9999 of any one type. Year is intentionally NOT
 * encoded — createdAt already tells us when, and per-year sequence
 * resets complicate sorting/parsing later.
 *
 * Each helper accepts an optional Prisma transaction client so the
 * number is allocated inside the same tx as the row insert. Sequences
 * are session-independent in PG, so even if the surrounding tx rolls
 * back the consumed value is gone — that's intentional: numbers are
 * gap-tolerant identifiers, not row counts.
 */

type TxOrDb = PrismaClient | Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

async function nextCounterValue(kind: string, client?: TxOrDb): Promise<number> {
  const c = client ?? (await tenantDb());
  const rows = (await c.$queryRawUnsafe(
    `INSERT INTO "TenantCounter" ("tenantId", "kind", "value")
     VALUES (current_setting('app.tenant_id', true), $1, 1)
     ON CONFLICT ("tenantId", "kind")
       DO UPDATE SET "value" = "TenantCounter"."value" + 1
     RETURNING "value"`,
    kind,
  )) as Array<{ value: bigint | number }>;
  const v = rows[0]?.value;
  if (v === undefined || v === null) throw new Error(`Счётчик ${kind} не вернул значение`);
  return typeof v === "bigint" ? Number(v) : v;
}

function format(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export async function nextDealNumber(client?: TxOrDb): Promise<string> {
  return format("D", await nextCounterValue("DEAL", client));
}

export async function nextEstimateNumber(client?: TxOrDb): Promise<string> {
  return format("E", await nextCounterValue("ESTIMATE", client));
}

export async function nextRepairOrderNumber(client?: TxOrDb): Promise<string> {
  return format("RO", await nextCounterValue("REPAIR_ORDER", client));
}

export async function nextPartOrderNumber(client?: TxOrDb): Promise<string> {
  return format("PO", await nextCounterValue("PART_ORDER", client));
}

export async function nextRentalBookingNumber(client?: TxOrDb): Promise<string> {
  return format("RB", await nextCounterValue("RENTAL_BOOKING", client));
}
