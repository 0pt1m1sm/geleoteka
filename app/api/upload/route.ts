import { NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  processImage,
} from "@/lib/uploads";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

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
