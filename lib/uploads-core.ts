import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const MAX_OUTPUT_WIDTH = 1600;

const IMAGE_URL_RE = /^\/api\/images\/([a-z0-9]{20,})$/i;
const LEGACY_STATIC_RE = /^\/images\/(rentals|parts)\/[\w.-]+$/;

export interface ProcessedImage {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  size: number;
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MAX_OUTPUT_WIDTH, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    mimeType: "image/webp",
    width: info.width,
    height: info.height,
    size: data.length,
  };
}

export function imageIdFromUrl(url: string): string | null {
  const match = IMAGE_URL_RE.exec(url);
  return match ? match[1] : null;
}

export function parsePhotosFromForm(
  raw: FormDataEntryValue | null,
): { urls: string[]; error: string | null } {
  if (raw === null || raw === "") return { urls: [], error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : String(raw));
  } catch {
    return { urls: [], error: "Некорректный формат списка фото" };
  }
  if (!Array.isArray(parsed)) {
    return { urls: [], error: "Список фото должен быть массивом" };
  }
  const urls: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string" || entry.length === 0) {
      return { urls: [], error: "Список фото содержит некорректные значения" };
    }
    if (!imageIdFromUrl(entry) && !LEGACY_STATIC_RE.test(entry)) {
      return { urls: [], error: "Список фото содержит недопустимый URL" };
    }
    urls.push(entry);
  }
  return { urls, error: null };
}
