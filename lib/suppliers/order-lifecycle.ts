/**
 * Pure lifecycle gates for supplier orders (Story 5, plan 2026-07-11).
 * The actions in app/actions/supplier-orders.ts enforce these server-side;
 * pages use them to decide which controls to render. DB-free by design.
 */

/** Full editing (supplier, lines, landed-cost inputs) — DRAFT only. Once the
 *  order is placed, the lines are a commitment receiving reconciles against. */
export function canFullyEditOrder(status: string): boolean {
  return status === "DRAFT";
}

/** Meta (orderNumber / tracking / ETA / notes) stays editable while the order
 *  is alive; the manual terminal states freeze it. */
export function canEditOrderMeta(status: string): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

/**
 * Удаление БЕЗ следов приёмки — доступно любому, кто ведёт закупки.
 *
 * Раньше требовался ещё и статус DRAFT, но это условие было произвольным:
 * заказ, размещённый у поставщика и потом отменённый, ничего не принял, и
 * держать его в списке навсегда незачем. Настоящий предмет защиты — приёмка:
 * если по строке что-то приняли, документ описывает движение товара, и стирать
 * его молча нельзя.
 */
export function canDeleteOrder(_status: string, lines: Array<{ receivedQuantity: number }>): boolean {
  return lines.every((l) => l.receivedQuantity === 0);
}

/**
 * Удаление заказа, по которому УЖЕ принимали, — только ADMIN.
 *
 * Такой заказ это учётный документ: он объясняет, откуда на складе взялся
 * товар. Оставить его неудаляемым нельзя (тестовые и ошибочные заказы иначе
 * висят вечно), но и отдавать любому менеджеру неправильно — удаляет тот, кто
 * отвечает за данные. Интерфейс обязан прямо сказать, что приёмки были.
 */
export function canForceDeleteOrder(permissionRole: string): boolean {
  return permissionRole === "ADMIN";
}

export interface DraftPartRefCounts {
  isActive: boolean;
  price: number;
  movementCount: number;
  placedQty: number;
  otherSupplierLineCount: number;
  estimateLineCount: number;
  partLineCount: number;
  partOrderItemCount: number;
}

/**
 * GC predicate for catalog drafts created by NEW_PART order lines (critic m1):
 * delete the Part only when it still looks like an untouched draft (hidden,
 * zero price) AND nothing anywhere references it. Conservative by design —
 * accumulation is acceptable, a wrong delete is not.
 */
export function isOrphanDraftPart(c: DraftPartRefCounts): boolean {
  return (
    !c.isActive &&
    c.price === 0 &&
    c.movementCount === 0 &&
    c.placedQty === 0 &&
    c.otherSupplierLineCount === 0 &&
    c.estimateLineCount === 0 &&
    c.partLineCount === 0 &&
    c.partOrderItemCount === 0
  );
}
