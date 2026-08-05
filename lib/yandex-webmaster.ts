import "server-only";

import { getSetting } from "@/lib/settings";

/**
 * Клиент Вебмастер API v4 (эндпоинты сверены с оф. доками 2026-08-05):
 *   GET /v4/user                                → { user_id }
 *   GET /v4/user/{uid}/hosts                    → { hosts: [{ host_id, ascii_host_url, verified }] }
 *   GET /v4/user/{uid}/hosts/{hid}/summary      → { sqi, searchable_pages_count, excluded_pages_count }
 *   GET .../search-queries/popular              → { queries: [{ query_text, indicators }] }
 *
 * Все сбои (нет токена, сеть, 4xx) деградируют в null — панель обязана
 * рендериться без данных, а не падать. Токен в лог не попадает никогда.
 */

const API = "https://api.webmaster.yandex.net/v4";
const SITE_HOST = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru").host;

export interface WebmasterQueryRow {
  query: string;
  shows: number;
  clicks: number;
  avgPosition: number | null;
}

export interface WebmasterSummary {
  searchablePages: number | null;
  excludedPages: number | null;
  sqi: number | null;
  topQueries: WebmasterQueryRow[];
}

async function apiGet(path: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// user_id/host_id не меняются — резолвим раз на процесс.
let cachedIds: { userId: number; hostId: string } | null = null;

async function resolveIds(token: string): Promise<{ userId: number; hostId: string } | null> {
  if (cachedIds) return cachedIds;
  const user = await apiGet("/user", token);
  const userId = user?.user_id as number | undefined;
  if (!userId) return null;
  const hostsRes = await apiGet(`/user/${userId}/hosts`, token);
  const hosts = (hostsRes?.hosts ?? []) as Array<Record<string, unknown>>;
  const host =
    hosts.find(
      (h) => h.verified === true && String(h.ascii_host_url ?? "").includes(SITE_HOST),
    ) ?? hosts.find((h) => h.verified === true);
  if (!host?.host_id) return null;
  cachedIds = { userId, hostId: String(host.host_id) };
  return cachedIds;
}

export async function fetchWebmasterSummary(): Promise<WebmasterSummary | null> {
  const token = (await getSetting("YANDEX_OAUTH_TOKEN"))?.trim();
  if (!token) return null;

  const ids = await resolveIds(token);
  if (!ids) return null;
  const base = `/user/${ids.userId}/hosts/${ids.hostId}`;

  const [summary, queriesRes] = await Promise.all([
    apiGet(`${base}/summary`, token),
    apiGet(
      `${base}/search-queries/popular?order_by=TOTAL_SHOWS&limit=10` +
        `&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION`,
      token,
    ),
  ]);
  if (!summary && !queriesRes) return null;

  const topQueries: WebmasterQueryRow[] = ((queriesRes?.queries ?? []) as Array<
    Record<string, unknown>
  >).map((q) => {
    const ind = (q.indicators ?? {}) as Record<string, number>;
    return {
      query: String(q.query_text ?? ""),
      shows: Math.round(ind.TOTAL_SHOWS ?? 0),
      clicks: Math.round(ind.TOTAL_CLICKS ?? 0),
      avgPosition:
        typeof ind.AVG_SHOW_POSITION === "number"
          ? Math.round(ind.AVG_SHOW_POSITION * 10) / 10
          : null,
    };
  });

  return {
    searchablePages:
      typeof summary?.searchable_pages_count === "number"
        ? summary.searchable_pages_count
        : null,
    excludedPages:
      typeof summary?.excluded_pages_count === "number" ? summary.excluded_pages_count : null,
    sqi: typeof summary?.sqi === "number" ? summary.sqi : null,
    topQueries,
  };
}

/** Только для тестов: сброс кэша идентификаторов. */
export function __resetWebmasterCache(): void {
  cachedIds = null;
}
