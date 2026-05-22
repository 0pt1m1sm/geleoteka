"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { deleteOrphanImages, parsePhotosFromForm } from "@/lib/uploads";
import { recordMovement } from "@/lib/wms/public";
import { TENANT_KEY, actorId } from "@/lib/wms-host";

/**
 * Parses the hidden form field posted by `<PartTrimPicker name="trimIds" />`.
 * The picker emits a JSON-encoded `string[]` of trim ids; on submit we resolve
 * it back to an array and validate every id exists.
 */
async function parseTrimIds(raw: unknown): Promise<{ ids: string[]; error: string | null }> {
  if (raw === null || raw === undefined || raw === "") {
    return { ids: [], error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : String(raw));
  } catch {
    return { ids: [], error: "Некорректный формат списка вариантов" };
  }
  if (!Array.isArray(parsed)) {
    return { ids: [], error: "Список вариантов должен быть массивом" };
  }
  const ids = parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (ids.length === 0) return { ids: [], error: null };
  const found = (await db.vehicleTrim.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })) as Array<{ id: string }>;
  if (found.length !== ids.length) {
    return { ids: [], error: "Один или несколько вариантов не найдены в каталоге" };
  }
  return { ids, error: null };
}

export async function createPart(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const article = (formData.get("article") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const price = parseInt(formData.get("price") as string);
  const quantity = parseInt(formData.get("quantity") as string) || 0;
  const isOEM = formData.get("isOEM") === "on";
  const categoryId = (formData.get("categoryId") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const compareAtPrice = parseInt(formData.get("compareAtPrice") as string) || null;
  const { ids: trimIds, error: trimErr } = await parseTrimIds(formData.get("trimIds"));
  if (trimErr) return { error: trimErr };
  const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
  if (photoErr) return { error: photoErr };

  if (!article || !name || isNaN(price)) {
    return { error: "Артикул, название и цена обязательны" };
  }

  const existing = await db.part.findUnique({ where: { article } });
  if (existing) {
    return { error: "Запчасть с таким артикулом уже существует" };
  }

  const slug = slugify(`${article}-${name}`).slice(0, 80);

  // Part + its opening-balance StockItem are created atomically so a part can
  // never exist without a stock row (which would silently lose the opening qty).
  await db.$transaction(async (tx) => {
    const created = (await tx.part.create({
      data: {
        slug,
        article,
        name,
        description,
        price,
        compareAtPrice,
        isOEM,
        categoryId: categoryId || null,
        photos: photoUrls,
        partTrims: {
          create: trimIds.map((trimId) => ({ trimId })),
        },
      },
      select: { id: true },
    })) as { id: string };

    // Opening balance: seed the StockItem counter directly (subsequent CHANGES
    // go through the ledger). Every part gets a StockItem so joins/lookup resolve.
    await tx.stockItem.create({
      data: { partId: created.id, quantity, tenantKey: TENANT_KEY },
    });
  });

  redirect("/admin/parts");
}

export async function updatePart(
  partId: string,
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const name = (formData.get("name") as string)?.trim();
  const price = parseInt(formData.get("price") as string);
  const quantity = parseInt(formData.get("quantity") as string) || 0;
  const isOEM = formData.get("isOEM") === "on";
  const categoryId = (formData.get("categoryId") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const compareAtPrice = parseInt(formData.get("compareAtPrice") as string) || null;
  const isActive = formData.get("isActive") !== "off";
  const { ids: trimIds, error: trimErr } = await parseTrimIds(formData.get("trimIds"));
  if (trimErr) return { error: trimErr };
  const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
  if (photoErr) return { error: photoErr };

  if (!name || isNaN(price)) {
    return { error: "Название и цена обязательны" };
  }

  // Replace partTrims atomically: drop old links, recreate with new selection.
  // Persist new photos[] and delete UploadedImage rows for removed photo URLs
  // when no other Part/Vehicle still references them (ref-counted cleanup).
  await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    const current = (await tx.part.findUnique({
      where: { id: partId },
      select: { photos: true },
    })) as { photos: string[] } | null;
    const removed = (current?.photos ?? []).filter((u: string) => !photoUrls.includes(u));
    await tx.part.update({
      where: { id: partId },
      data: {
        name,
        description,
        price,
        compareAtPrice,
        isOEM,
        categoryId: categoryId || null,
        isActive,
        photos: photoUrls,
      },
    });

    // On-hand is owned by the WMS ledger. A manual quantity edit reconciles via
    // an ADJUSTMENT movement (delta = new − current) so the ledger keeps summing
    // to the counter. No-op when unchanged.
    const si = (await tx.stockItem.findUnique({
      where: { partId },
      select: { quantity: true },
    })) as { quantity: number } | null;
    const currentQty = si?.quantity ?? 0;
    const delta = quantity - currentQty;
    if (delta !== 0) {
      await recordMovement(tx, {
        item: { itemId: partId },
        reason: "ADJUSTMENT",
        qty: delta,
        source: { type: "AdminEdit", id: null },
        actorId: actorId(session),
        note: "Manual stock edit",
        tenantKey: TENANT_KEY,
      });
    }
    await tx.partTrim.deleteMany({ where: { partId } });
    if (trimIds.length > 0) {
      await tx.partTrim.createMany({
        data: trimIds.map((trimId) => ({ partId, trimId })),
        skipDuplicates: true,
      });
    }
    if (removed.length > 0) {
      await deleteOrphanImages(removed, tx);
    }
  });

  redirect("/admin/parts");
}

