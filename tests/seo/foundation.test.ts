import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSetting = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
}));

import { DEFAULT_OG_IMAGE, pageSeo } from "@/lib/seo";
import { pingIndexNow } from "@/lib/indexnow";
import { GET as getIndexNowKey } from "@/app/indexnow-key.txt/route";

beforeEach(() => {
  getSetting.mockReset();
  vi.unstubAllGlobals();
});

describe("pageSeo", () => {
  it("falls back to the default OG image when none is passed", () => {
    const meta = pageSeo({
      title: "Услуги",
      description: "Описание",
      path: "/services",
    });
    const og = meta.openGraph as { images: Array<{ url: string }> };
    expect(og.images).toEqual([DEFAULT_OG_IMAGE]);
    const tw = meta.twitter as { images: string[] };
    expect(tw.images).toEqual([DEFAULT_OG_IMAGE.url]);
  });

  it("keeps an explicitly passed image", () => {
    const meta = pageSeo({
      title: "Запчасть",
      description: "Описание",
      path: "/parts/x",
      image: "/images/parts/x.jpg",
    });
    const og = meta.openGraph as { images: Array<{ url: string }> };
    expect(og.images[0].url).toBe("/images/parts/x.jpg");
  });

  it("sets the canonical to the given path", () => {
    const meta = pageSeo({ title: "t", description: "d", path: "/models" });
    expect(meta.alternates).toEqual({ canonical: "/models" });
  });
});

describe("indexnow key route", () => {
  it("404s while the key is not configured", async () => {
    getSetting.mockResolvedValue(null);
    const res = await getIndexNowKey();
    expect(res.status).toBe(404);
  });

  it("serves the key as plain text when configured", async () => {
    getSetting.mockResolvedValue("abc123def456");
    const res = await getIndexNowKey();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    await expect(res.text()).resolves.toBe("abc123def456");
  });
});

describe("pingIndexNow", () => {
  it("does nothing without a key", async () => {
    getSetting.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await pingIndexNow(["/services"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts host, key, keyLocation and absolute urls", async () => {
    getSetting.mockResolvedValue("abc123def456");
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await pingIndexNow(["/services", "/services/to"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://yandex.com/indexnow");
    const body = JSON.parse(init.body);
    expect(body.key).toBe("abc123def456");
    expect(body.keyLocation).toMatch(/\/indexnow-key\.txt$/);
    expect(body.urlList).toHaveLength(2);
    expect(body.urlList[0]).toMatch(/^https?:\/\/.+\/services$/);
  });

  it("swallows network failures instead of throwing", async () => {
    getSetting.mockResolvedValue("abc123def456");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(pingIndexNow(["/services"])).resolves.toBeUndefined();
  });
});
