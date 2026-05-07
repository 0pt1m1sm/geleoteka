/**
 * Convert text to URL-safe slug. Lowercases, strips non-alphanumerics, collapses
 * whitespace and consecutive dashes, trims. Used for parts catalog slugs (both
 * the manual-create server action and the CSV import API).
 *
 * Note: this strips Cyrillic — the original implementation deliberately ignored
 * non-ASCII because the parts catalog uses Latin-only article numbers + names
 * for storage. If a future feature needs Cyrillic transliteration, change here.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
