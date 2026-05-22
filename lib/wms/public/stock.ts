/** Available stock = on-hand − reserved. Pure; safe on hot paths. */
export function availableStock(item: { quantity: number; reserved: number }): number {
  return item.quantity - item.reserved;
}
