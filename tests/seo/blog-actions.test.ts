import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

const pingIndexNow = vi.fn();
vi.mock("@/lib/indexnow", () => ({
  pingIndexNow: (...args: unknown[]) => pingIndexNow(...args),
}));

const blogCreate = vi.fn();
const blogUpdate = vi.fn();
const blogFindUnique = vi.fn();
const blogDelete = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    blogPost: {
      create: (...args: unknown[]) => blogCreate(...args),
      update: (...args: unknown[]) => blogUpdate(...args),
      findUnique: (...args: unknown[]) => blogFindUnique(...args),
      delete: (...args: unknown[]) => blogDelete(...args),
    },
  },
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createBlogPost, deleteBlogPost, updateBlogPost } from "@/app/actions/blog";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  for (const mock of [
    requireRole,
    recordAudit,
    pingIndexNow,
    blogCreate,
    blogUpdate,
    blogFindUnique,
    blogDelete,
    redirect,
  ])
    mock.mockReset();
  requireRole.mockResolvedValue({ id: "u1", name: "Админ", permissionRole: "ADMIN" });
  recordAudit.mockResolvedValue(undefined);
  pingIndexNow.mockResolvedValue(undefined);
});

describe("createBlogPost", () => {
  it("rejects a bad slug before touching the database", async () => {
    const result = await createBlogPost(null, form({ title: "Т", slug: "Плохой Slug", content: "x" }));
    expect(result.error).toContain("Slug");
    expect(blogCreate).not.toHaveBeenCalled();
  });

  it("stamps publishedAt and pings IndexNow only when published", async () => {
    blogCreate.mockResolvedValue({ id: "p1" });
    await createBlogPost(
      null,
      form({ title: "Т", slug: "t", content: "Текст", published: "on" }),
    );
    const data = (blogCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(pingIndexNow).toHaveBeenCalledWith(["/blog", "/blog/t"]);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "blog.create", targetType: "BlogPost" }),
    );
    expect(redirect).toHaveBeenCalledWith("/admin/blog");
  });

  it("keeps drafts out of the index: no publishedAt, no ping", async () => {
    blogCreate.mockResolvedValue({ id: "p1" });
    await createBlogPost(null, form({ title: "Т", slug: "t", content: "Текст" }));
    const data = (blogCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.publishedAt).toBeNull();
    expect(pingIndexNow).not.toHaveBeenCalled();
  });
});

describe("updateBlogPost", () => {
  it("audits a publish transition as blog.publish and keeps first publishedAt", async () => {
    const firstPublish = new Date("2026-08-01T10:00:00Z");
    blogFindUnique.mockResolvedValue({
      id: "p1",
      published: false,
      publishedAt: firstPublish,
      slug: "t",
    });
    blogUpdate.mockResolvedValue({});
    await updateBlogPost(
      "p1",
      null,
      form({ title: "Т", slug: "t", content: "Текст", published: "on" }),
    );
    const data = (blogUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.publishedAt).toBe(firstPublish);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "blog.publish" }),
    );
  });

  it("audits an unpublish transition as blog.unpublish", async () => {
    blogFindUnique.mockResolvedValue({
      id: "p1",
      published: true,
      publishedAt: new Date(),
      slug: "t",
    });
    blogUpdate.mockResolvedValue({});
    await updateBlogPost("p1", null, form({ title: "Т", slug: "t", content: "Текст" }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "blog.unpublish" }),
    );
    expect(pingIndexNow).not.toHaveBeenCalled();
  });
});

describe("deleteBlogPost", () => {
  it("deletes, audits and pings the listing", async () => {
    blogFindUnique.mockResolvedValue({ slug: "t", title: "Т" });
    blogDelete.mockResolvedValue({});
    await deleteBlogPost("p1");
    expect(blogDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "blog.delete" }),
    );
    expect(pingIndexNow).toHaveBeenCalledWith(["/blog"]);
  });
});
