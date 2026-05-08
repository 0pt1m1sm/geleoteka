"use server";

import { db } from "@/lib/db";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

type ActionState =
  | { error: string | null }
  | { success: true }
  | null;

/** Request password reset — sends SMS code */
export async function requestPasswordResetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const phone = normalizePhone(formData.get("phone") as string);

  if (!phone) {
    return { error: "Телефон обязателен" };
  }
  if (!isValidRussianPhone(phone)) {
    return { error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }

  const user = await db.user.findUnique({ where: { phone } });

  if (!user) {
    return { success: true };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.passwordReset.create({
    data: { userId: user.id, code, expiresAt },
  });

  console.log(`[SMS] Password reset code for ${phone}: ${code}`);

  return { success: true };
}
