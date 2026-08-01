export function parseStaffNotificationRetentionDays(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{1,4}$/.test(normalized)) return null;
  const days = Number.parseInt(normalized, 10);
  return days >= 1 && days <= 3650 ? days : null;
}
