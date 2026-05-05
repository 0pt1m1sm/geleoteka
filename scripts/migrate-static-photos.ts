import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { imageIdFromUrl, processImage } from "../lib/uploads-core";

interface VehicleRow {
  id: string;
  photos: string[];
}

async function main(): Promise<void> {
  const vehicles = (await db.vehicle.findMany({
    where: { ownershipType: "RENTAL" },
    select: { id: true, photos: true },
  })) as VehicleRow[];

  let migrated = 0;
  let skipped = 0;

  for (const v of vehicles) {
    const photos = v.photos ?? [];
    if (photos.length === 0) {
      skipped += 1;
      continue;
    }
    if (photos.every((u) => imageIdFromUrl(u) !== null)) {
      // All photos already in the new format — no work to do.
      skipped += 1;
      continue;
    }

    const newUrls: string[] = [];
    for (const url of photos) {
      if (imageIdFromUrl(url)) {
        newUrls.push(url);
        continue;
      }
      if (!url.startsWith("/images/")) {
        // Unknown URL shape — leave untouched rather than guess.
        newUrls.push(url);
        continue;
      }
      const filePath = resolve(process.cwd(), "public", url.replace(/^\//, ""));
      const buf = await readFile(filePath);
      const processed = await processImage(buf);
      const created = (await db.uploadedImage.create({
        data: {
          bytes: new Uint8Array(processed.bytes),
          mimeType: processed.mimeType,
          width: processed.width,
          height: processed.height,
          size: processed.size,
          createdById: null,
        },
        select: { id: true },
      })) as { id: string };
      newUrls.push(`/api/images/${created.id}`);
    }

    await db.vehicle.update({
      where: { id: v.id },
      data: { photos: newUrls },
    });
    migrated += 1;
  }

  console.log(`Migrated ${migrated} vehicles (skipped ${skipped})`);
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
