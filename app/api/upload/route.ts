import { NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  processImage,
} from "@/lib/uploads";

export async function POST(request: Request): Promise<NextResponse> {
  const db = await tenantDb();
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  // Приватность выбирает вызывающий: витринные загрузчики её не передают и
  // получают PUBLIC. Значение по умолчанию именно такое, чтобы забытый параметр
  // не закрыл картинку каталога, а не наоборот — закрытость ставится осознанно.
  const visibility = formData.get("visibility") === "private" ? "PRIVATE" : "PUBLIC";

  if (!file) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Файл слишком большой (макс. 5 МБ)" },
      { status: 413 },
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Поддерживаются только изображения (JPG, PNG, WebP, AVIF)" },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processImage(buf);
  } catch {
    return NextResponse.json(
      { error: "Не удалось обработать изображение" },
      { status: 422 },
    );
  }

  const session = await getSession();
  // Prisma `Bytes` field expects Uint8Array<ArrayBuffer>; sharp returns Buffer
  // (which is a Uint8Array, but its underlying ArrayBufferLike trips strict types).
  const bytesForDb = new Uint8Array(processed.bytes);
  const created = (await db.uploadedImage.create({
    data: {
      bytes: bytesForDb,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      size: processed.size,
      visibility,
      createdById: session?.id ?? null,
    },
    select: { id: true },
  })) as { id: string };

  return NextResponse.json({
    url: `/api/images/${created.id}`,
    width: processed.width,
    height: processed.height,
  });
}
