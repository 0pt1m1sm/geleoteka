/**
 * Choose the attachment download URL for a CRM row by which provider it came
 * from. Pure string logic, safe in client components.
 *
 *   - A row carrying a canonical `emailMessageId` (every Timeweb IMAP row, and
 *     Resend rows written after the migration) uses the provider-neutral route,
 *     addressed by internal id — the server reads the real locator from the DB.
 *   - A legacy row with only a Resend `resendEmailId` keeps the old proxy.
 *   - Neither present → null, and the caller renders no link.
 *
 * `emailMessageId` wins when both exist: it resolves the same bytes but never
 * puts a provider UUID in the URL, and it keeps working once Resend Receiving is
 * eventually retired.
 */
export function emailAttachmentHref(
  row: { emailMessageId?: string | null; resendEmailId?: string | null },
  attachmentId: string,
): string | null {
  if (row.emailMessageId) {
    return `/api/admin/email-messages/${encodeURIComponent(row.emailMessageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  }
  if (row.resendEmailId) {
    return `/api/admin/inbox/attachments/${encodeURIComponent(attachmentId)}?email_id=${encodeURIComponent(row.resendEmailId)}`;
  }
  return null;
}
