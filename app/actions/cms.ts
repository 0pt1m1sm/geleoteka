"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

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

  // The footer (in app/(public)/layout.tsx) consumes CMS keys, so we revalidate
  // the WHOLE public layout subtree — passing 'layout' as the second argument
  // tells Next.js to invalidate the matched layout and every page beneath it.
  // Without this, only the literal "/" page would refresh, and /services,
  // /parts etc. would keep showing the stale footer until each one revalidated
  // on its own schedule.
  revalidatePath("/", "layout");
}
