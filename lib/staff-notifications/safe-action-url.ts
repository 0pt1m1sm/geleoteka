const INTERNAL_ORIGIN = "https://staff-notifications.invalid";
const SAFE_FRAGMENT = /^#[A-Za-z0-9._~:-]+$/;

/**
 * Accept only a relative admin URL with no query string. URL parsing is still
 * required after the prefix check because dot segments such as
 * `/admin/%2e%2e/public` normalize outside the admin namespace.
 */
export function isSafeAdminActionUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return false;
  }
  if (value.includes("?") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }
  if (/%(?:0a|0d|00)/i.test(value)) return false;
  if (value !== "/admin" && !value.startsWith("/admin/")) return false;

  let parsed: URL;
  try {
    parsed = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return false;
  }

  if (parsed.origin !== INTERNAL_ORIGIN || parsed.search !== "") return false;
  if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) return false;
  if (parsed.hash && !SAFE_FRAGMENT.test(parsed.hash)) return false;

  // Reject alternative spellings that the URL parser silently normalizes.
  return `${parsed.pathname}${parsed.hash}` === value;
}

export function assertSafeAdminActionUrl(value: string): string {
  if (!isSafeAdminActionUrl(value)) {
    throw new Error("Staff notification action URL must be an internal /admin path without a query string");
  }
  return value;
}

/** Named constructor used by publishers instead of accepting provider/user URLs. */
export function makeAdminActionUrl(path: string): string {
  return assertSafeAdminActionUrl(path);
}
