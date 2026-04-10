"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function respondToEstimateItem(
  itemId: string,
  approved: boolean
): Promise<void> {
  await requireAuth();

  await db.estimateItem.update({
    where: { id: itemId },
    data: {
      approved,
      ...(approved
        ? { approvedAt: new Date() }
        : { rejectedAt: new Date() }),
    },
  });

  // Recalculate estimate total based on approved items
  const item = await db.estimateItem.findUnique({
    where: { id: itemId },
    select: { estimateId: true },
  });

  if (item) {
    const approvedItems = await db.estimateItem.findMany({
      where: { estimateId: item.estimateId, approved: { not: false } },
    });

    const total = approvedItems.reduce(
      (sum: number, i: { unitPrice: number; quantity: number }) =>
        sum + i.unitPrice * i.quantity,
      0
    );

    await db.estimate.update({
      where: { id: item.estimateId },
      data: { total },
    });
  }
}
