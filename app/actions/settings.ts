"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { invalidateSetting, KNOWN_SETTINGS } from "@/lib/settings";

export interface UpsertSettingResult {
  error: string | null;
  ok: boolean;
}

/**
 * Upsert a setting row by key. Only keys listed in KNOWN_SETTINGS are
 * accepted — prevents arbitrary key writes through a forged form.
 */
export async function upsertSetting(
  _prev: UpsertSettingResult | null,
  formData: FormData,
): Promise<UpsertSettingResult> {
  const session = await requireRole(["ADMIN"]);

  const key = ((formData.get("key") as string | null) ?? "").trim();
  const value = ((formData.get("value") as string | null) ?? "").trim();

  if (!key) return { ok: false, error: "Не передан ключ" };

  const known = KNOWN_SETTINGS.find((s) => s.key === key);
  if (!known) return { ok: false, error: `Неизвестный ключ настройки: ${key}` };

  if (!value) {
    // Empty value = "delete" — drop the row so env-var fallback wins again.
    await db.setting.deleteMany({ where: { key } });
  } else {
    await db.setting.upsert({
      where: { key },
      create: { key, value, updatedByUserId: session.id },
      update: { value, updatedByUserId: session.id },
    });
  }

  invalidateSetting(key);
  revalidatePath("/admin/settings/integrations");
  return { ok: true, error: null };
}
