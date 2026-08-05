import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const snapshotFindFirst = vi.fn();
const snapshotCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    seoSnapshot: {
      findFirst: (...args: unknown[]) => snapshotFindFirst(...args),
      create: (...args: unknown[]) => snapshotCreate(...args),
    },
  },
}));

const collectSeoHealth = vi.fn();
vi.mock("@/lib/seo-health", () => ({
  collectSeoHealth: (...args: unknown[]) => collectSeoHealth(...args),
}));

const fetchWebmasterSummary = vi.fn();
vi.mock("@/lib/yandex-webmaster", () => ({
  fetchWebmasterSummary: (...args: unknown[]) => fetchWebmasterSummary(...args),
}));

const fetchSearchTraffic = vi.fn();
vi.mock("@/lib/yandex-metrika-api", () => ({
  fetchSearchTraffic: (...args: unknown[]) => fetchSearchTraffic(...args),
}));

import { runSeoSnapshotTick } from "@/lib/seo-snapshot";

const HEALTH = {
  sitemapUrls: 56,
  servicesTotal: 10,
  servicesWithBody: 10,
  postsPublished: 3,
  postsDraft: 6,
  metrikaConfigured: true,
  verificationConfigured: false,
  indexnowConfigured: true,
};

beforeEach(() => {
  for (const m of [snapshotFindFirst, snapshotCreate, collectSeoHealth, fetchWebmasterSummary, fetchSearchTraffic])
    m.mockReset();
  collectSeoHealth.mockResolvedValue(HEALTH);
  fetchWebmasterSummary.mockResolvedValue({
    searchablePages: 41,
    excludedPages: 5,
    sqi: 10,
    topQueries: [],
  });
  fetchSearchTraffic.mockResolvedValue({ daily: [], visits7d: 17, visits30d: 60, topPhrases: [] });
  snapshotCreate.mockResolvedValue({ id: "s1" });
});

describe("runSeoSnapshotTick", () => {
  it("skips when the last auto snapshot is fresher than 20h", async () => {
    snapshotFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60_000) });
    await expect(runSeoSnapshotTick()).resolves.toBe("fresh");
    expect(snapshotCreate).not.toHaveBeenCalled();
  });

  it("captures an auto snapshot with API metrics mapped", async () => {
    snapshotFindFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await expect(runSeoSnapshotTick()).resolves.toBe("captured");
    const data = (snapshotCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.source).toBe("auto");
    expect(data.indexedPagesApi).toBe(41);
    expect(data.sqi).toBe(10);
    expect(data.searchVisits7d).toBe(17);
    expect(data.sitemapUrls).toBe(56);
  });

  it("still captures with nulls when both APIs are unavailable", async () => {
    snapshotFindFirst.mockResolvedValue(null);
    fetchWebmasterSummary.mockResolvedValue(null);
    fetchSearchTraffic.mockResolvedValue(null);
    await expect(runSeoSnapshotTick()).resolves.toBe("captured");
    const data = (snapshotCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.indexedPagesApi).toBeNull();
    expect(data.searchVisits7d).toBeNull();
  });

  it("swallows storage errors and reports failed", async () => {
    snapshotFindFirst.mockRejectedValue(new Error("db down"));
    await expect(runSeoSnapshotTick()).resolves.toBe("failed");
  });
});
