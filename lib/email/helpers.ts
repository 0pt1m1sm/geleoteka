import { sendEmail, type SendEmailResult } from "./send";
import {
  renderBookingConfirmation,
  type BookingConfirmationInput,
} from "./templates/booking-confirmation";
import {
  renderEstimateSent,
  type EstimateSentInput,
} from "./templates/estimate-sent";
import {
  renderRegistrationWelcome,
  type RegistrationWelcomeInput,
} from "./templates/registration-welcome";
import {
  renderPartOrderConfirmation,
  type PartOrderConfirmationInput,
} from "./templates/part-order-confirmation";
import {
  renderRentalBookingConfirmation,
  type RentalBookingConfirmationInput,
} from "./templates/rental-booking-confirmation";

/**
 * Threading metadata each typed helper forwards to the transport. Call
 * sites set `messageId` (the `<{cuid}@geleoteka.ru>` value they also
 * persist in `CommunicationLog.externalId`) so inbound replies thread
 * back to the same row.
 */
export interface EmailThreadOptions {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

export type EmailHelperResult =
  | { success: true; id?: string; messageId?: string }
  | { success: false; error: string };

/**
 * Each helper:
 *   1. composes its template,
 *   2. dispatches via the shared transport (forwarding threading headers),
 *   3. swallows every error (logged, never re-thrown).
 *
 * Call sites use `void send*Email(...).catch(() => {})` to make the
 * fire-and-forget contract explicit at the call site too.
 */
async function dispatch<T extends { subject: string; html: string; text: string }>(
  label: string,
  to: string,
  build: () => T,
  thread?: EmailThreadOptions,
): Promise<EmailHelperResult> {
  try {
    const { subject, html, text } = build();
    const res: SendEmailResult = await sendEmail({
      to,
      subject,
      html,
      text,
      messageId: thread?.messageId,
      inReplyTo: thread?.inReplyTo,
      references: thread?.references,
    });
    if (!res.success) {
      console.error(`[EMAIL HELPER] ${label} failed: ${res.error}`);
      return { success: false, error: res.error };
    }
    return { success: true, id: res.id, messageId: res.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[EMAIL HELPER] ${label} threw`, err);
    return { success: false, error: message };
  }
}

export async function sendBookingConfirmationEmail(
  to: string,
  input: BookingConfirmationInput,
  thread?: EmailThreadOptions,
): Promise<EmailHelperResult> {
  return dispatch("booking", to, () => renderBookingConfirmation(input), thread);
}

export async function sendEstimateSentEmail(
  to: string,
  input: EstimateSentInput,
  thread?: EmailThreadOptions,
): Promise<EmailHelperResult> {
  return dispatch("estimate-sent", to, () => renderEstimateSent(input), thread);
}

export async function sendRegistrationWelcomeEmail(
  to: string,
  input: RegistrationWelcomeInput,
  thread?: EmailThreadOptions,
): Promise<EmailHelperResult> {
  return dispatch("registration-welcome", to, () => renderRegistrationWelcome(input), thread);
}

export async function sendPartOrderConfirmationEmail(
  to: string,
  input: PartOrderConfirmationInput,
  thread?: EmailThreadOptions,
): Promise<EmailHelperResult> {
  return dispatch("part-order", to, () => renderPartOrderConfirmation(input), thread);
}

export async function sendRentalBookingConfirmationEmail(
  to: string,
  input: RentalBookingConfirmationInput,
  thread?: EmailThreadOptions,
): Promise<EmailHelperResult> {
  return dispatch("rental-booking", to, () => renderRentalBookingConfirmation(input), thread);
}
