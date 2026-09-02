"use server";

import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { queueEmailVerificationEmail } from "@/lib/email-verification/send";

export interface ResendEmailVerificationState {
  ok: boolean;
  message: string;
}

export async function resendEmailVerificationAction(
  previous: ResendEmailVerificationState | null,
): Promise<ResendEmailVerificationState> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  void previous;
  const session = await requireAuth();
  const user = (await db.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
    },
  })) as {
    id: string;
    email: string;
    name: string;
    emailVerifiedAt: Date | null;
  } | null;

  if (!user) return { ok: false, message: "Пользователь не найден" };
  if (user.emailVerifiedAt) {
    return { ok: true, message: "Email уже подтверждён" };
  }

  try {
    const result = await queueEmailVerificationEmail({
      userId: user.id,
      email: user.email,
      customerName: user.name,
      reason: "resend",
    });
    if (result.status === "rate_limited") {
      return {
        ok: false,
        message: "Письмо уже отправлено. Повторите попытку через несколько минут.",
      };
    }
    return {
      ok: true,
      message: "Письмо отправлено. Проверьте входящие и папку «Спам».",
    };
  } catch {
    // The token-bearing URL is intentionally absent from logs and responses.
    console.error("[EMAIL VERIFICATION] resend email could not be queued");
    return {
      ok: false,
      message: "Не удалось отправить письмо. Попробуйте позже.",
    };
  }
}
