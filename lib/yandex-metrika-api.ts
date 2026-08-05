import "server-only";

import { getSetting } from "@/lib/settings";

/**
 * Метрика Stat API (GET https://api-metrika.yandex.net/stat/v1/data):
 * визиты из поисковых систем по дням за 30 дней + топ поисковых фраз.
 * Тот же OAuth-токен, что у Вебмастера; любые сбои → null, страница
 * рендерится без блока. Токен и сырые ответы не логируются.
 */

const API = "https://api-metrika.yandex.net/stat/v1/data";

export interface SearchTrafficPoint {
  date: string;
  visits: number;
}

export interface SearchTraffic {
  daily: SearchTrafficPoint[];
  visits7d: number;
  visits30d: number;
  topPhrases: Array<{ phrase: string; visits: number }>;
}

async function statGet(
  params: Record<string, string>,
  token: string,
): Promise<Array<{ dimensions: Array<{ name: string }>; metrics: number[] }> | null> {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API}?${qs}`, {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: unknown };
    return Array.isArray(body.data)
      ? (body.data as Array<{ dimensions: Array<{ name: string }>; metrics: number[] }>)
      : null;
  } catch {
    return null;
  }
}

export async function fetchSearchTraffic(): Promise<SearchTraffic | null> {
  const [token, counterId] = await Promise.all([
    getSetting("YANDEX_OAUTH_TOKEN"),
    getSetting("YANDEX_METRIKA_ID"),
  ]);
  const tk = token?.trim();
  const id = counterId?.trim();
  if (!tk || !id) return null;

  const common = { ids: id, "filters": "ym:s:trafficSource=='organic'" };
  const [daily, phrases] = await Promise.all([
    statGet(
      {
        ...common,
        metrics: "ym:s:visits",
        dimensions: "ym:s:date",
        date1: "30daysAgo",
        date2: "today",
        sort: "ym:s:date",
        limit: "31",
      },
      tk,
    ),
    statGet(
      {
        ...common,
        metrics: "ym:s:visits",
        dimensions: "ym:s:lastSearchPhrase",
        date1: "30daysAgo",
        date2: "today",
        sort: "-ym:s:visits",
        limit: "10",
      },
      tk,
    ),
  ]);
  if (!daily) return null;

  const points: SearchTrafficPoint[] = daily.map((row) => ({
    date: row.dimensions[0]?.name ?? "",
    visits: Math.round(row.metrics[0] ?? 0),
  }));
  const visits30d = points.reduce((s, p) => s + p.visits, 0);
  const visits7d = points.slice(-7).reduce((s, p) => s + p.visits, 0);

  return {
    daily: points,
    visits7d,
    visits30d,
    topPhrases: (phrases ?? [])
      .map((row) => ({
        phrase: row.dimensions[0]?.name ?? "",
        visits: Math.round(row.metrics[0] ?? 0),
      }))
      .filter((p) => p.phrase),
  };
}
