/**
 * Shared display helpers for customers that may be detached from a Deal or
 * RepairOrder. `Deal.customerUserId` and `RepairOrder.userId` are nullable —
 * a customer record can be erased while the deal/repair-order it's linked to
 * is kept (detached, not deleted). Every rendering site that dereferences
 * the customer relation goes through these helpers instead of crashing on
 * `customer.name`.
 */

export const DELETED_CUSTOMER_LABEL = "Удалённый клиент";

/** Customer's display name, or the deleted-customer label when detached. */
export function customerName(
  customer: { name: string } | null | undefined,
): string {
  return customer?.name ?? DELETED_CUSTOMER_LABEL;
}
