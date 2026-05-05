import { db } from "@/lib/db";

const CACHE_HEADER = "public, max-age=31536000, immutable";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  ctx: RouteCtx,
): Promise<Response> {
  const { id } = await ctx.params;
  const etag = `"${id}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, "cache-control": CACHE_HEADER },
    });
  }

  const img = (await db.uploadedImage.findUnique({
    where: { id },
    select: { bytes: true, mimeType: true },
  })) as { bytes: Uint8Array; mimeType: string } | null;

  if (!img) {
    return new Response("Not found", { status: 404 });
  }

  // Re-wrap into a fresh ArrayBuffer-backed Uint8Array so the strict Response
  // BodyInit type accepts it (Prisma's Bytes maps to Uint8Array<ArrayBufferLike>).
  const body = new Uint8Array(img.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": img.mimeType,
      "cache-control": CACHE_HEADER,
      etag,
    },
  });
}
