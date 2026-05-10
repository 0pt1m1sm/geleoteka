/**
 * Single point of update for `CustomerProfile.lastTouchAt`.
 *
 * Other modules call this after any user-affecting mutation
 * (communication logged, RO status change, deal stage change,
 * fulfillment update). Centralizing the write here avoids drift
 * between modules and keeps the CRM dashboard's "stale customer"
 * filter trustworthy.
 *
 * Phase 0 of the Deal+Fulfillment migration ships only the function
 * shape so callers can wire up now. The `lastTouchAt` column lands in
 * the CRM expansion migration (Phase 3); this becomes a real write at
 * that point. Until then, calls are a no-op — accepted as a known gap.
 */
export async function bumpLastTouch(customerUserId: string): Promise<void> {
  // No-op until CRM expansion migration adds CustomerProfile.lastTouchAt.
  // The argument is referenced so the parameter signature stays stable
  // for callers; the touch will become a real write in Phase 3.
  void customerUserId;
}
