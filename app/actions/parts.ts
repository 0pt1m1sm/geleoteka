"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { duplicateNewPartWhere, newPartSku } from "@/lib/part-sku";
import { normalizeOem } from "@/lib/part-reference";
import { pingIndexNow } from "@/lib/indexnow";
import { slugify } from "@/lib/slug";
import { deleteOrphanImages, parsePhotosFromForm } from "@/lib/uploads";
import { recordMovement } from "@/lib/wms/public";
import { TENANT_KEY, actorId, defaultWarehouseId } from "@/lib/wms-host";
import { assignCodes, DuplicateCodeError } from "@/lib/warehouse/codes";
import { MAX_WEIGHT_GRAMS } from "@/lib/suppliers/landed-cost";
import { extractModelCodes } from "@/lib/part-reference";
import { ensurePartReference, resolveGenerationIds } from "@/lib/part-reference-lookup";

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

/** Parse the «Вес (кг)» field to grams (Int), capped at MAX_WEIGHT_GRAMS, or null when blank/invalid. */
function parseWeightGrams(raw: unknown): number | null {
  const kg = parseFloat(raw as string);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return Math.min(Math.round(kg * 1000), MAX_WEIGHT_GRAMS);
}


/** Нарушение уникального индекса Prisma. Клиент генерируется с @ts-nocheck,
 *  поэтому типизированного PrismaClientKnownRequestError под рукой нет —
 *  распознаём по коду, как это делается в остальных экшенах. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
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
  const weightGrams = parseWeightGrams(formData.get("weightKg"));
  const { ids: trimIds, error: trimErr } = await parseTrimIds(formData.get("trimIds"));
  if (trimErr) return { error: trimErr };
  const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
  if (photoErr) return { error: photoErr };

  if (!article || !name || isNaN(price)) {
    return { error: "Артикул, название и цена обязательны" };
  }
  if (price <= 0) {
    return { error: "Цена должна быть больше нуля" };
  }
  if (quantity < 0) {
    return { error: "Количество не может быть отрицательным" };
  }

  // Пустой после нормализации артикул («---», «???») уронил бы newPartSku
  // необработанным исключением — экшен обязан вернуть {error}.
  if (!normalizeOem(article)) {
    return { error: "Артикул должен содержать буквы или цифры" };
  }
  const sku = newPartSku(article);

  // Проверяем ОБА ключа, потому что они разные.
  // По article — потому что миграция залила sku дословно (sku := article):
  // для «ПОДЗАКАЗ-07» и прочих артикулов с пунктуацией нормализованный ключ
  // не совпал бы с сохранённым, и защита молча выключилась бы на 15 из 70
  // позиций боевого каталога.
  // По sku — потому что уникальный индекс стоит именно на нём: без этой
  // ветки «A463-421-0098» и «A4634210098» прошли бы проверку по тексту, а
  // вставка упала бы на Part_sku_key необработанным P2002; на легаси-строках
  // с дословным sku вместо ошибки появился бы тихий дубль.
  // Обе колонки проиндексированы (Part_article_idx, Part_sku_key).
  const existing = await db.part.findFirst({
    where: duplicateNewPartWhere(article, sku),
    select: { id: true },
  });
  if (existing) {
    return { error: "Запчасть с таким артикулом уже существует" };
  }

  const slug = slugify(`${article}-${name}`).slice(0, 80);

  // Каждый реальный артикул пополняет номенклатурный справочник ДО создания
  // товара — товар сразу ссылается на номенклатуру (referenceId), витринное
  // название (Part.name) живёт отдельно от официального (reference.name).
  // Служебные коды (ПОДЗАКАЗ-*) остаются без связи. Применяемость —
  // объединение «Совместимых вариантов» (тримы → поколения) и кодов кузова
  // из текста; неизвестные каталогу коды молча пропускаются.
  const category = categoryId
    ? ((await db.partCategory.findUnique({
        where: { id: categoryId },
        select: { name: true },
      })) as { name: string } | null)
    : null;
  const trimGens = trimIds.length
    ? ((await db.vehicleTrim.findMany({
        where: { id: { in: trimIds } },
        select: { generationId: true },
      })) as Array<{ generationId: string }>)
    : [];
  const { ids: textGenIds } = await resolveGenerationIds(
    extractModelCodes(`${name} ${description ?? ""}`),
  );
  const referenceId = await ensurePartReference(db, {
    article,
    name,
    groupName: category?.name ?? null,
    generationIds: [...new Set([...trimGens.map((t) => t.generationId), ...textGenIds])],
  });

  // Part + its opening-balance StockItem are created atomically so a part can
  // never exist without a stock row (which would silently lose the opening qty).
  // P2002 ловим отдельно: проверка выше и уникальный индекс — разные моменты
  // времени, поэтому гонка двух одновременных заведений одного артикула всё
  // равно доходит до индекса. Без этого пользователь получал бы необработанную
  // ошибку сервер-экшена и терял заполненную форму вместе с загруженными фото.
  try {
    await db.$transaction(async (tx) => {
      const created = (await tx.part.create({
        data: {
          slug,
          article,
          sku,
          name,
          description,
          price,
          compareAtPrice,
          weightGrams,
          isOEM,
          referenceId,
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
        data: { partId: created.id, quantity, tenantKey: TENANT_KEY, warehouseId: await defaultWarehouseId(tx) },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Запчасть с таким артикулом уже существует" };
    }
    throw err;
  }

  await pingIndexNow(["/parts", `/parts/${slug}`]);
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
  const weightGrams = parseWeightGrams(formData.get("weightKg"));
  const isActive = formData.get("isActive") !== "off";
  const barcode = (formData.get("barcode") as string)?.trim() || null;
  const gtin = (formData.get("gtin") as string)?.trim() || null;
  const { ids: trimIds, error: trimErr } = await parseTrimIds(formData.get("trimIds"));
  if (trimErr) return { error: trimErr };
  const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
  if (photoErr) return { error: photoErr };

  if (!name || isNaN(price)) {
    return { error: "Название и цена обязательны" };
  }
  if (price <= 0) {
    return { error: "Цена должна быть больше нуля" };
  }
  if (quantity < 0) {
    return { error: "Количество не может быть отрицательным" };
  }

  // Replace partTrims atomically: drop old links, recreate with new selection.
  // Persist new photos[] and delete UploadedImage rows for removed photo URLs
  // when no other Part/Vehicle still references them (ref-counted cleanup).
  try {
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
        weightGrams,
        isOEM,
        categoryId: categoryId || null,
        isActive,
        photos: photoUrls,
      },
    });

    // On-hand is owned by the WMS ledger. A manual quantity edit reconciles via
    // an ADJUSTMENT movement (delta = new − current) so the ledger keeps summing
    // to the counter. No-op when unchanged.
    const warehouseId = await defaultWarehouseId(tx);
    const si = (await tx.stockItem.findUnique({
      where: { partId_warehouseId: { partId, warehouseId } },
      select: { quantity: true },
    })) as { quantity: number } | null;
    const currentQty = si?.quantity ?? 0;
    const delta = quantity - currentQty;
    if (delta !== 0) {
      await recordMovement(tx, {
        item: { itemId: partId, warehouseId },
        reason: "ADJUSTMENT",
        qty: delta,
        source: { type: "AdminEdit", id: null },
        actorId: actorId(session),
        note: "Manual stock edit",
        tenantKey: TENANT_KEY,
      });
    }
    // Assign/clear barcode + gtin on the StockItem (per-field uniqueness).
    await assignCodes(tx, partId, barcode, gtin);
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
  } catch (e: unknown) {
    if (e instanceof DuplicateCodeError) {
      return {
        error:
          e.field === "barcode"
            ? "Этот штрихкод уже назначен другой позиции"
            : "Этот GTIN уже назначен другой позиции",
      };
    }
    throw e;
  }

  await pingIndexNow(["/parts"]);
  redirect("/admin/parts");
}

