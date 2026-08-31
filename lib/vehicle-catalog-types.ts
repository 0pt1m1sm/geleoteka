/**
 * Pure types + label helpers for the vehicle catalog. No DB imports here so
 * the module is safe to import from client components.
 *
 * Server-only queries (which use Prisma) live in `@/lib/vehicle-catalog`.
 */

export type FuelType = "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID";

export interface Trim {
  id: string;
  code: string;
  bodyStyle: string | null;
  drivetrain: string | null;
  fuelType: FuelType | null;
  engineCode: string | null;
  /** Decimal serialised as string by Prisma. Render as float when needed. */
  displacementL: string | null;
  horsepower: number | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface Generation {
  id: string;
  code: string;
  yearFrom: number;
  yearTo: number | null;
  /** Текст про кузов: болячки и особенности. Показывается и на своей странице,
   *  и списком на странице модели. */
  description?: string | null;
  /** Populated only by trim-aware queries (`getActiveModelsWithTrims`). */
  trims?: Trim[];
  /** Default trim id for the generation, populated by trim-aware queries. */
  defaultTrimId?: string;
}

export interface VehicleModel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  engines: string | null;
  features: string[];
  generations: Generation[];
}

export interface Manufacturer {
  id: string;
  slug: string;
  name: string;
}

/** "1990–2018 · W463" / "2018–н.в. · W463A" */
export function generationLabel(g: Pick<Generation, "code" | "yearFrom" | "yearTo">): string {
  const end = g.yearTo === null ? "н.в." : String(g.yearTo);
  return `${g.yearFrom}–${end} · ${g.code}`;
}

/**
 * Display name for a vehicle model in pickers and saved-car strips. The shop
 * is single-brand (Mercedes-Benz) so the make is implied by context — we just
 * show the model name. This is the seam for the future multi-brand refactor:
 * when more than one brand ships, this function will prepend the brand label
 * (or skip it when only one brand is configured).
 */
export function modelDisplayName(modelName: string): string {
  return modelName;
}

/**
 * Отображаемые имена моделей (свободный текст в Service.applicableModels)
 * слагифицируются наивно, но у части имён реальный слаг каталога другой:
 * «AMG» → amg-gt, а «EQ» отдельной страницы не имеет (в каталоге eqa/eqb/…).
 * Раньше наивный слаг давал 404 (/models/amg, /models/eq). resolveModelSlug
 * возвращает настоящий слаг либо null для имён без страницы — ссылку строим
 * только на непустой результат.
 *
 * Сервис профильный по G-Class, но обслуживает все Mercedes, поэтому
 * ссылки ведут на любую реально существующую модель, а не только g-class.
 */
const MODEL_SLUG_ALIASES: Readonly<Record<string, string>> = { amg: "amg-gt" };
const MODEL_SLUG_WITHOUT_PAGE: ReadonlySet<string> = new Set(["eq"]);

export function resolveModelSlug(displayName: string): string | null {
  const naive = displayName.trim().toLowerCase().replace(/\s+/g, "-");
  if (!naive || MODEL_SLUG_WITHOUT_PAGE.has(naive)) return null;
  return MODEL_SLUG_ALIASES[naive] ?? naive;
}

/** Just the code, for compact contexts. */
export function generationShort(g: Pick<Generation, "code">): string {
  return g.code;
}

/**
 * Human-readable trim label for picker dropdowns and admin UI. Joins non-empty
 * fields with " · " in priority order: code · engineCode · drivetrain ·
 * bodyStyle. Default trims render as "Все варианты этого поколения".
 */
export function trimLabel(
  t: Pick<Trim, "code" | "engineCode" | "drivetrain" | "bodyStyle" | "isDefault">,
): string {
  if (t.isDefault) return "Все варианты этого поколения";
  const parts = [t.code, t.engineCode, t.drivetrain, t.bodyStyle].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.join(" · ");
}
