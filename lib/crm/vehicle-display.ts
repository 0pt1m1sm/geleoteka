/**
 * Shared display helpers for a car that may be detached from a RepairOrder or
 * Deal. `RepairOrder.vehicleId` and `Deal.vehicleId` are nullable: the car is a
 * descriptive reference on the paperwork, not its owner, so it can be deleted
 * or re-entered while every job line, labour entry, part and photo stays put.
 *
 * Mirrors lib/crm/customer-display.ts — same problem, same shape: rendering
 * sites go through these instead of crashing on `vehicle.model`.
 */

export const DETACHED_VEHICLE_LABEL = "Машина удалена";

/**
 * The car as shown in lists and headers, or the detached label.
 *
 * The make is fixed because the shop only takes Mercedes — the same assumption
 * every existing call site already renders inline.
 */
export function vehicleLabel(
  vehicle: { model: string; year?: number | null } | null | undefined,
): string {
  if (!vehicle) return DETACHED_VEHICLE_LABEL;
  return `Mercedes-Benz ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ""}`;
}
