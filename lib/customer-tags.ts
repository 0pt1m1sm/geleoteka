/**
 * Customer-tag color palette and validation helpers.
 *
 * Pure module — no DB, no React, no Next imports. Imported from server pages,
 * client components, and verify scripts. CSS classes paired with each slug
 * are defined in `app/styles/components.css`.
 */

export type ColorSlug =
  | "gold"
  | "gray"
  | "red"
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "neutral";

export interface TagColor {
  slug: ColorSlug;
  label: string;
  cssClass: string;
}

export const TAG_COLOR_PALETTE: readonly TagColor[] = [
  { slug: "gold", label: "Золотой", cssClass: "tag-color-gold" },
  { slug: "gray", label: "Серый", cssClass: "tag-color-gray" },
  { slug: "red", label: "Красный", cssClass: "tag-color-red" },
  { slug: "green", label: "Зелёный", cssClass: "tag-color-green" },
  { slug: "blue", label: "Синий", cssClass: "tag-color-blue" },
  { slug: "purple", label: "Фиолетовый", cssClass: "tag-color-purple" },
  { slug: "orange", label: "Оранжевый", cssClass: "tag-color-orange" },
  { slug: "neutral", label: "Нейтральный", cssClass: "tag-color-neutral" },
] as const;

const VALID_SLUGS: ReadonlySet<string> = new Set(TAG_COLOR_PALETTE.map((c) => c.slug));

export const TAG_NAME_MIN = 1;
export const TAG_NAME_MAX = 32;

/**
 * Trim, collapse internal whitespace runs to a single space, and validate
 * length. Throws Error with a Russian message on invalid input.
 */
export function normalizeTagName(input: string): string {
  if (typeof input !== "string") {
    throw new Error("Имя тэга обязательно");
  }
  const collapsed = input.trim().replace(/\s+/g, " ");
  if (collapsed.length < TAG_NAME_MIN) {
    throw new Error("Имя тэга обязательно");
  }
  if (collapsed.length > TAG_NAME_MAX) {
    throw new Error(`Имя тэга не может быть длиннее ${TAG_NAME_MAX} символов`);
  }
  return collapsed;
}

/** Type guard for color slug. */
export function isValidColorSlug(slug: string): slug is ColorSlug {
  return VALID_SLUGS.has(slug);
}

/** Map a slug (possibly bogus) to its CSS class with a neutral fallback. */
export function getTagBadgeClass(slug: string): string {
  if (isValidColorSlug(slug)) {
    return TAG_COLOR_PALETTE.find((c) => c.slug === slug)!.cssClass;
  }
  return "tag-color-neutral";
}
