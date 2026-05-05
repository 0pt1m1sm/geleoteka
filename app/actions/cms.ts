"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/** Pages that consume CMSBlock data — kept here so the revalidate list stays
 *  next to the only writer. Add a path when a new page starts reading CMS. */
const CMS_CONSUMER_PATHS = ["/", "/contacts"] as const;

export async function updateCMSBlock(
  key: string,
  content: Record<string, string>,
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  await db.cMSBlock.upsert({
    where: { key },
    update: { content },
    create: { key, content },
  });

  for (const path of CMS_CONSUMER_PATHS) revalidatePath(path);
}
