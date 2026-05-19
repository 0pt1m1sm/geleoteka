/**
 * Parse a datetime-local form value into a Date suitable for CommunicationLog.createdAt.
 *
 * Returns:
 *   - { ok: true, value: undefined } when input is empty — caller leaves
 *     createdAt unset so Prisma's `@default(now())` fires.
 *   - { ok: true, value: Date } when parseable. Future dates are clamped to
 *     `now` to keep timelines monotonic — a manager cannot post-date a call.
 *   - { ok: false, error } when the string isn't a parseable timestamp.
 *
 * Pure function (no I/O, no auth, no Prisma) so it can be exercised from a
 * Node verify script without a Next.js request context.
 */
export type ParseOccurredAtResult =
  | { ok: true; value: Date | undefined }
  | { ok: false; error: string };

export function parseOccurredAt(
  raw: string | null | undefined,
  now: Date = new Date(),
): ParseOccurredAtResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: undefined };

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "Некорректная дата записи" };
  }
  return { ok: true, value: parsed > now ? now : parsed };
}
