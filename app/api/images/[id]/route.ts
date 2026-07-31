import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { db } from "@/lib/db";

/**
 * Отдача загруженных изображений.
 *
 * Один маршрут обслуживает две разные вещи: витрину (каталог запчастей, аренда,
 * контент сайта) и фотоотчёты по заказ-нарядам. Раньше он не различал их вовсе —
 * отдавал что угодно кому угодно с годовым `immutable`, из-за чего фотография
 * чужой машины жила по прямой ссылке и оседала в кэшах. Различие теперь несёт
 * само изображение (`UploadedImage.visibility`), а не маршрут.
 */

/** Витрина: неизменяемая и кэшируемая где угодно — под одним id всегда один файл. */
const PUBLIC_CACHE = "public, max-age=31536000, immutable";
/**
 * Приватная: не кэшируется нигде. `private` было бы мало — общий кэш её
 * действительно не тронет, но браузер сохранил бы файл на диск, и он пережил бы
 * выход из аккаунта на общем компьютере в сервисе.
 */
const PRIVATE_CACHE = "no-store";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

/**
 * Кто может смотреть фотоотчёт: сотрудник, ведущий работы, или тот, чья это
 * машина. Владельца ищем и по заказ-наряду, и по машине — у отвязанного
 * заказ-наряда `userId` пуст (клиент стёрт), и тогда остаётся только сотрудник.
 */
async function mayViewPrivate(imageId: string, viewerId: string, role: string): Promise<boolean> {
  if (await roleHasPermission(role, "service.manage")) return true;

  // Ссылка хранится строкой — внешнего ключа на UploadedImage у фото нет.
  const photo = (await db.repairOrderPhoto.findFirst({
    where: { url: `/api/images/${imageId}` },
    select: {
      repairOrder: { select: { userId: true, vehicle: { select: { ownerUserId: true } } } },
    },
  })) as {
    repairOrder: { userId: string | null; vehicle: { ownerUserId: string | null } | null };
  } | null;
  // Приватная, но ни к чему не привязана — показывать некому, кроме сотрудника.
  if (!photo) return false;

  const ro = photo.repairOrder;
  return ro.userId === viewerId || ro.vehicle?.ownerUserId === viewerId;
}

export async function GET(request: Request, ctx: RouteCtx): Promise<Response> {
  const { id } = await ctx.params;
  const etag = `"${id}"`;

  // Видимость читаем прежде всего: она решает, можно ли вообще отвечать 304 без
  // проверки прав. Раньше ветка if-none-match стояла первой и отдавала ответ,
  // ни разу не заглянув в базу.
  const img = (await db.uploadedImage.findUnique({
    where: { id },
    select: { bytes: true, mimeType: true, visibility: true },
  })) as { bytes: Uint8Array; mimeType: string; visibility: string } | null;

  if (!img) return new Response("Not found", { status: 404 });

  const isPrivate = img.visibility === "PRIVATE";
  if (isPrivate) {
    const session = await getSession();
    if (!session) return new Response("Unauthorized", { status: 401 });
    if (!(await mayViewPrivate(id, session.id, session.permissionRole))) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const cache = isPrivate ? PRIVATE_CACHE : PUBLIC_CACHE;

  // Условный запрос обслуживаем только после проверки прав.
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": cache } });
  }

  // Re-wrap into a fresh ArrayBuffer-backed Uint8Array so the strict Response
  // BodyInit type accepts it (Prisma's Bytes maps to Uint8Array<ArrayBufferLike>).
  const body = new Uint8Array(img.bytes);
  return new Response(body, {
    status: 200,
    headers: { "content-type": img.mimeType, "cache-control": cache, etag },
  });
}
