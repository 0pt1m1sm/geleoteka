import "server-only";

import { tenantDb } from "@/lib/tenant/scoped-db";
import {
  generateOutboundMessageId,
  isPlausibleEmail,
  markOutboundEmailFailed,
  markOutboundEmailSent,
  recordOutboundEmail,
  sendEmailVerificationEmail,
  sendRegistrationWelcomeEmail,
} from "@/lib/email";
import { APP_URL } from "@/lib/email/send";
import {
  issueEmailVerificationToken,
  type EmailVerificationDb,
} from "@/lib/email-verification/core";

export type QueueEmailVerificationResult =
  | { status: "queued" }
  | { status: "rate_limited"; retryAt: Date };

interface QueueEmailVerificationInput {
  userId: string;
  email: string;
  customerName: string;
  reason: "registration" | "resend";
  now?: Date;
}

/**
 * Persist the hashed token and an outbound-log row, then hand the message to
 * the existing transport without delaying navigation on provider I/O. The log
 * body intentionally omits the verification URL, keeping the raw token out of
 * the database.
 */
export async function queueEmailVerificationEmail(
  input: QueueEmailVerificationInput,
): Promise<QueueEmailVerificationResult> {
  const db = await tenantDb();
  const issued = await issueEmailVerificationToken(
    db as unknown as EmailVerificationDb,
    {
      userId: input.userId,
      email: input.email,
      appUrl: APP_URL,
      now: input.now,
    },
  );
  if (issued.status === "rate_limited") return issued;

  const registration = input.reason === "registration";
  const subject = registration
    ? "Geleoteka — добро пожаловать"
    : "Geleoteka — подтвердите email";
  const messageId = generateOutboundMessageId();
  if (isPlausibleEmail(input.email)) {
    await recordOutboundEmail({
      customerUserId: input.userId,
      subject,
      body: registration
        ? "Приветственное письмо с предложением подтвердить email."
        : "Повторное письмо с предложением подтвердить email.",
      messageId,
    });
  }

  const delivery = registration
    ? sendRegistrationWelcomeEmail(
        input.email,
        {
          customerName: input.customerName,
          loginUrl: new URL("/login", APP_URL).toString(),
          verificationUrl: issued.verificationUrl,
        },
        { messageId },
      )
    : sendEmailVerificationEmail(
        input.email,
        {
          customerName: input.customerName,
          verificationUrl: issued.verificationUrl,
        },
        { messageId },
      );

  void delivery
    .then((result) => {
      if (!result.success) {
        return markOutboundEmailFailed(messageId, result.error);
      }
      return markOutboundEmailSent(messageId);
    })
    .catch(() => {
      // No error detail is logged here: provider helpers already report their
      // transport outcome, and this closure contains the raw-token URL.
      return markOutboundEmailFailed(messageId, "verification email dispatch failed");
    });

  return { status: "queued" };
}
