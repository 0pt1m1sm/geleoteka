import "server-only";
import { db } from "./db";
import { imageIdFromUrl } from "./uploads-core";

export {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  MAX_OUTPUT_WIDTH,
  imageIdFromUrl,
  parsePhotosFromForm,
  processImage,
} from "./uploads-core";
export type { ProcessedImage } from "./uploads-core";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * For each removed `/api/images/<id>` URL, delete the UploadedImage row when
 * no Part.photos or Vehicle.photos still references it. Static URLs (legacy
 * /images/...) are skipped — those files live on disk, not in this table.
 */
export async function deleteOrphanImages(
  removedUrls: string[],
  tx: TxClient,
): Promise<void> {
  for (const url of removedUrls) {
    const id = imageIdFromUrl(url);
    if (!id) continue;
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT (
        (SELECT count(*) FROM "Part"    WHERE ${url} = ANY("photos"))
      + (SELECT count(*) FROM "Vehicle" WHERE ${url} = ANY("photos"))
      ) AS count
    `;
    const refs = Number(rows[0]?.count ?? 0);
    if (refs === 0) {
      await tx.uploadedImage.delete({ where: { id } }).catch(() => {
        // Row already gone — fine.
      });
    }
  }
}
