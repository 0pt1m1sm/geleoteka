"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function updateCMSBlock(
  key: string,
  content: Record<string, string>
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.cMSBlock.upsert({
    where: { key },
    update: { content },
    create: { key, content },
  });
}
