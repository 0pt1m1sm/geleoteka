import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSetting = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
}));

const serviceCount = vi.fn();
const blogCount = vi.fn();
const snapshotCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    service: { count: (...args: unknown[]) => serviceCount(...args) },
    blogPost: { count: (...args: unknown[]) => blogCount(...args) },
    seoSnapshot: { create: (...args: unknown[]) => snapshotCreate(...args) },
  },
}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/yandex-webmaster", () => ({
  fetchWebmasterSummary: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/yandex-metrika-api", () => ({
  fetchSearchTraffic: vi.fn().mockResolvedValue(null),
}));

import { collectSeoHealth, withDelta } from "@/lib/seo-health";
import { captureSeoSnapshot } from "@/app/actions/seo";

function sitemap(n: number): string {
  return `<urlset>${Array.from({ length: n }, (_, i) => `<url><loc>https://x/${i}</loc></url>`).join("")}</urlset>`;
}

beforeEach(() => {
  for (const m of [getSetting, serviceCount, blogCount, snapshotCreate, requireRole]) m.mockReset();
  vi.unstubAllGlobals();
  requireRole.mockResolvedValue({ id: "u1", name: "Админ", permissionRole: "ADMIN" });
  serviceCount.mockImplementation((args?: { where?: unknown }) =>
    Promise.resolve(args?.where ? 7 : 10),
  );
  blogCount.mockImplementation((args: { where: { published: boolean } }) =>
    Promise.resolve(args.where.published ? 2 : 7),
  );
  getSetting.mockImplementation((key: string) =>
    Promise.resolve(key === "YANDEX_METRIKA_ID" ? "111282352" : null),
  );
});

describe("collectSeoHealth", () => {
  it("counts sitemap urls and maps settings to booleans", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sitemap(53))));
    const h = await collectSeoHealth();
    expect(h.sitemapUrls).toBe(53);
    expect(h.servicesTotal).toBe(10);
    expect(h.servicesWithBody).toBe(7);
    expect(h.postsPublished).toBe(2);
    expect(h.postsDraft).toBe(7);
    expect(h.metrikaConfigured).toBe(true);
    expect(h.verificationConfigured).toBe(false);
    expect(h.indexnowConfigured).toBe(false);
  });

  it("degrades sitemap count to null on fetch failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const h = await collectSeoHealth();
    expect(h.sitemapUrls).toBeNull();
    expect(h.servicesTotal).toBe(10);
  });
});

describe("sparklinePath", () => {
  it("maps values to a scaled SVG path", async () => {
    const { sparklinePath } = await import("@/components/admin/Sparkline");
    const d = sparklinePath([0, 10, 5], 102, 44, 1);
    expect(d.startsWith("M1.0,43.0")).toBe(true);
    expect(d).toContain("L51.0,1.0");
    expect(d.endsWith("L101.0,22.0")).toBe(true);
    expect(sparklinePath([], 100, 40)).toBe("");
  });
});

describe("withDelta", () => {
  it("formats value with signed delta, hides zero delta and missing data", () => {
    expect(withDelta(12, 8)).toBe("12 (+4)");
    expect(withDelta(8, 12)).toBe("8 (-4)");
    expect(withDelta(8, 8)).toBe("8");
    expect(withDelta(8, null)).toBe("8");
    expect(withDelta(null, 8)).toBe("—");
  });
});

describe("captureSeoSnapshot", () => {
  it("stores collected health plus manual fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sitemap(3))));
    snapshotCreate.mockResolvedValue({ id: "s1" });
    const fd = new FormData();
    fd.set("indexedPages", "8");
    fd.set("note", "4-я позиция по «ремонт гелендвагена москва»");

    await expect(captureSeoSnapshot(null, fd)).resolves.toEqual({ error: null });

    expect(requireRole).toHaveBeenCalledWith(["ADMIN", "MANAGER"]);
    const data = (snapshotCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.sitemapUrls).toBe(3);
    expect(data.indexedPages).toBe(8);
    expect(data.note).toContain("4-я позиция");
  });

  it("treats manual fields as optional and rejects negative indexedPages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sitemap(1))));
    snapshotCreate.mockResolvedValue({ id: "s1" });

    await expect(captureSeoSnapshot(null, new FormData())).resolves.toEqual({ error: null });
    const data = (snapshotCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.indexedPages).toBeNull();
    expect(data.note).toBeNull();

    const bad = new FormData();
    bad.set("indexedPages", "-5");
    const res = await captureSeoSnapshot(null, bad);
    expect(res.error).toContain("неотрицательным");
  });
});
