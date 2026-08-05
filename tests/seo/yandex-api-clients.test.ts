import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSetting = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
}));

import { __resetWebmasterCache, fetchWebmasterSummary } from "@/lib/yandex-webmaster";
import { fetchSearchTraffic } from "@/lib/yandex-metrika-api";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getSetting.mockReset();
  vi.unstubAllGlobals();
  __resetWebmasterCache();
});

describe("fetchWebmasterSummary", () => {
  it("returns null without a token and never calls the API", async () => {
    getSetting.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWebmasterSummary()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves ids, picks the verified host and maps summary+queries", async () => {
    getSetting.mockResolvedValue("token-1");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/user")) return Promise.resolve(jsonResponse({ user_id: 42 }));
      if (url.endsWith("/hosts"))
        return Promise.resolve(
          jsonResponse({
            hosts: [
              { host_id: "https:other.ru:443", ascii_host_url: "https://other.ru/", verified: true },
              {
                host_id: "https:geleoteka.ru:443",
                ascii_host_url: "https://geleoteka.ru/",
                verified: true,
              },
            ],
          }),
        );
      if (url.includes("/summary"))
        return Promise.resolve(
          jsonResponse({ sqi: 10, searchable_pages_count: 8, excluded_pages_count: 3 }),
        );
      if (url.includes("/search-queries/popular"))
        return Promise.resolve(
          jsonResponse({
            queries: [
              {
                query_text: "ремонт гелендвагена",
                indicators: { TOTAL_SHOWS: 120, TOTAL_CLICKS: 7, AVG_SHOW_POSITION: 8.44 },
              },
            ],
          }),
        );
      return Promise.resolve(new Response("nf", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const s = await fetchWebmasterSummary();
    expect(s).not.toBeNull();
    expect(s!.searchablePages).toBe(8);
    expect(s!.sqi).toBe(10);
    expect(s!.topQueries[0]).toEqual({
      query: "ремонт гелендвагена",
      shows: 120,
      clicks: 7,
      avgPosition: 8.4,
    });
    const hostsCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/hosts"));
    expect((hostsCall![1] as { headers: Record<string, string> }).headers.Authorization).toBe(
      "OAuth token-1",
    );
  });

  it("degrades to null on API errors", async () => {
    getSetting.mockResolvedValue("token-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })),
    );
    await expect(fetchWebmasterSummary()).resolves.toBeNull();
  });
});

describe("fetchSearchTraffic", () => {
  it("returns null without token or counter id", async () => {
    getSetting.mockImplementation((key: string) =>
      Promise.resolve(key === "YANDEX_METRIKA_ID" ? "111282352" : null),
    );
    await expect(fetchSearchTraffic()).resolves.toBeNull();
  });

  it("maps daily points, sums 7d/30d and top phrases", async () => {
    getSetting.mockImplementation((key: string) =>
      Promise.resolve(key === "YANDEX_METRIKA_ID" ? "111282352" : "tok"),
    );
    const days = Array.from({ length: 10 }, (_, i) => ({
      dimensions: [{ name: `2026-08-${String(i + 1).padStart(2, "0")}` }],
      metrics: [i + 1],
    }));
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("ym%3As%3Adate")) return Promise.resolve(jsonResponse({ data: days }));
      return Promise.resolve(
        jsonResponse({
          data: [{ dimensions: [{ name: "ремонт гелика" }], metrics: [5] }],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const t = await fetchSearchTraffic();
    expect(t).not.toBeNull();
    expect(t!.daily).toHaveLength(10);
    expect(t!.visits30d).toBe(55);
    expect(t!.visits7d).toBe(4 + 5 + 6 + 7 + 8 + 9 + 10);
    expect(t!.topPhrases[0]).toEqual({ phrase: "ремонт гелика", visits: 5 });
  });
});
