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

/** RepairOrder status labels (Russian) */
export const REPAIR_ORDER_STATUS_LABELS: Record<string, string> = {
  ESTIMATE: "Смета",
  APPROVED: "Согласовано",
  IN_PROGRESS: "В работе",
  AWAITING_PARTS: "Ожидает запчасти",
  QC: "Контроль качества",
  READY: "Готов к выдаче",
  INVOICED: "Выставлен счёт",
  PAID: "Оплачено",
  CLOSED: "Закрыт",
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
