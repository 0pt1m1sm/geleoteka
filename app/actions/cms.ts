"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { validateCMSContent } from "@/lib/cms-validate";

export type UpdateCMSResult = { ok: true } | { ok: false; error: string };

/**
 * Validate `content` against `CMS_SCHEMA[key]` and upsert. Persists `type`
 * alongside `content` so the row's runtime type matches the schema definition.
 * Revalidates the public layout subtree on success.
 */
export async function updateCMSBlock(
  key: string,
  content: unknown,
): Promise<UpdateCMSResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const result = validateCMSContent(key, content);
  if (!result.ok) return result;

  // Prisma's `Json` input type is a strict union; the validator's normalized
  // payload is a plain object/array tree — cast through `any` once at the
  // boundary to satisfy the generated client type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizedContent = result.normalized as any;

  await db.cMSBlock.upsert({
    where: { key },
    update: { type: result.type, content: normalizedContent },
    create: { key, type: result.type, content: normalizedContent },
  });

  // The footer (in app/(public)/layout.tsx) consumes CMS keys, so we revalidate
  // the WHOLE public layout subtree — passing 'layout' as the second argument
  // tells Next.js to invalidate the matched layout and every page beneath it.
  revalidatePath("/", "layout");
  return { ok: true };
}
