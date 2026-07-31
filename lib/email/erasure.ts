/**
 * Which stored mail belongs to one person alone.
 *
 * Erasing a customer may take their correspondence with them, but mail is
 * matched by address and an address is a shared key: a thread where they were
 * one of several recipients is also somebody else's correspondence, and
 * deleting the row would take a supplier's or another customer's conversation
 * with it.
 *
 * Lives outside the server action because a `"use server"` module may only
 * export async functions, and this needs to be a plain testable predicate.
 */

export interface MailParties {
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
}

/**
 * True when every outside party on the message is one of `known` — either the
 * person wrote it, or it was written to them and nobody else.
 *
 * Addresses are compared case-insensitively: the same mailbox arrives as
 * `Ivan@Mail.ru` in one header and `ivan@mail.ru` in the next, and a
 * case-sensitive miss here would silently keep mail the operator asked to
 * erase.
 */
export function isSolelyTheirs(message: MailParties, known: Iterable<string>): boolean {
  const addresses = new Set<string>();
  for (const a of known) addresses.add(a.trim().toLowerCase());
  if (addresses.size === 0) return false;

  const has = (a: string): boolean => addresses.has(a.trim().toLowerCase());
  if (has(message.fromEmail)) return true;

  const recipients = [...message.toEmails, ...message.ccEmails];
  // No recipients at all is not "solely theirs" — nothing ties it to them, and
  // the address match that produced the candidate must have come from `from`.
  if (recipients.length === 0) return false;
  return recipients.every(has);
}
