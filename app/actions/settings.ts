"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { invalidateSetting, KNOWN_SETTINGS } from "@/lib/settings";
import { SECRET_PLACEHOLDER } from "@/lib/settings-shared";

export interface UpsertSettingsResult {
  error: string | null;
  ok: boolean;
  savedKeys?: string[];
}

const PLACEHOLDER = SECRET_PLACEHOLDER;

/**
 * Bulk-upsert a group of settings — one Save button per integration card.
 *
 * Form payload is multi-key: each input's `name` is the setting key.
 * Special value handling:
 *   - empty string → drop the row (env-var fallback takes over)
 *   - placeholder string ("••••••") → no-op (user didn't touch this field;
 *     password inputs show a placeholder when a value is already set)
 *
 * Only keys listed in KNOWN_SETTINGS are accepted — prevents forged writes.
 */
export async function upsertSettings(
  _prev: UpsertSettingsResult | null,
  formData: FormData,
): Promise<UpsertSettingsResult> {
  const session = await requireRole(["ADMIN"]);

  const knownByKey = new Map(KNOWN_SETTINGS.map((s) => [s.key, s]));
  const savedKeys: string[] = [];

  for (const [rawKey, rawValue] of formData.entries()) {
    const key = rawKey.trim();
    if (!knownByKey.has(key)) continue; // Silently ignore unknown / framework fields.
    const raw = (rawValue as FormDataEntryValue).toString();
    const value = raw.trim();

    // Skip untouched secret fields (input held the masked placeholder).
    if (value === PLACEHOLDER) continue;

    if (value === "") {
      await db.setting.deleteMany({ where: { key } });
    } else {
      await db.setting.upsert({
        where: { key },
        create: { key, value, updatedByUserId: session.id },
        update: { value, updatedByUserId: session.id },
      });
    }
    invalidateSetting(key);
    savedKeys.push(key);
  }

  revalidatePath("/admin/settings/integrations");
  return { ok: true, error: null, savedKeys };
}

