import { db } from "@/lib/db";

/**
 * Single point of update for `CustomerProfile.lastTouchAt`.
 *
 * Other modules call this after any user-affecting mutation
 * (communication logged, RO status change, deal stage change,
 * fulfillment update). Centralizing the write here avoids drift
 * between modules and keeps the CRM dashboard's "stale customer"
 * filter trustworthy. Upserts so customers without a profile row
 * still get one on first touch.
 */
export async function bumpLastTouch(customerUserId: string): Promise<void> {
  const now = new Date();
  await db.customerProfile.upsert({
    where: { userId: customerUserId },
    update: { lastTouchAt: now },
    create: { userId: customerUserId, lastTouchAt: now, firstSeenAt: now },
  });
}
