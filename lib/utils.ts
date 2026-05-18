/** Format price in Rubles */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format date for Russian locale */
export function formatDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    ...options,
  }).format(d);
}

/** Format datetime for Russian locale */
export function formatDateTime(date: Date | string): string {
  return formatDate(date, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Strict HTML5 pattern for Russian phone numbers — exactly +7 followed by
 * 10 digits, or 8 followed by 10 digits. No spaces, parentheses, or dashes
 * allowed. Server normalizes both shapes to canonical +7XXXXXXXXXX before
 * storage; the client-side pattern is the gate.
 */
export const PHONE_PATTERN = "(\\+7|8)\\d{10}";
export const PHONE_TITLE = "Только российские номера: +7XXXXXXXXXX или 8XXXXXXXXXX (10 цифр после +7 или 8, без пробелов и скобок)";

/**
 * Validates that a phone string already passed `normalizePhone` lands at
 * the canonical `+7XXXXXXXXXX` shape (12 chars, +7 + 10 digits). Use as a
 * server-side gate after `normalizePhone()` — invalid input will keep its
 * original raw form, which this guard catches.
 */
export function isValidRussianPhone(normalizedPhone: string): boolean {
  return /^\+7\d{10}$/.test(normalizedPhone);
}

/**
 * Stricter HTML5 pattern for emails — ensures non-empty local part,
 * exactly one @, non-empty domain with at least one dot.
 */
export const EMAIL_PATTERN = "[^@\\s]+@[^@\\s]+\\.[^@\\s]+";
export const EMAIL_TITLE = "Введите корректный email, например name@example.com";

/** Normalize phone number to E.164 format */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.length === 11 && digits[0] === "7") {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits[0] === "8") {
    return `+7${digits.slice(1)}`;
  }
  return phone;
}

/** RepairOrder status labels (Russian). Collapsed 2026-05-18: estimate stage
 *  lives on Estimate now; RO tracks work only. */
export const REPAIR_ORDER_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Принят",
  IN_PROGRESS: "В работе",
  READY: "Готов к выдаче",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

/** JobLine status labels (Russian) */
export const JOB_LINE_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Предложено",
  APPROVED: "Согласовано",
  DECLINED: "Отклонено",
  DEFERRED: "Отложено",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
};

/** Loyalty tier configuration */
export const LOYALTY_TIERS = {
  SILVER: { minPoints: 0, maxPoints: 999, label: "Серебро" },
  GOLD: { minPoints: 1000, maxPoints: 4999, label: "Золото" },
  AMG_CLUB: { minPoints: 5000, maxPoints: Infinity, label: "AMG Club" },
} as const;

export type LoyaltyTier = keyof typeof LOYALTY_TIERS;

/** Get next tier info */
export function getNextTier(
  current: LoyaltyTier
): { tier: LoyaltyTier; pointsNeeded: number } | null {
  if (current === "SILVER") return { tier: "GOLD", pointsNeeded: 1000 };
  if (current === "GOLD") return { tier: "AMG_CLUB", pointsNeeded: 5000 };
  return null;
}
