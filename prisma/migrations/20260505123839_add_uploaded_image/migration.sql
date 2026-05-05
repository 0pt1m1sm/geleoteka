-- CreateTable
CREATE TABLE "UploadedImage" (
    "id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "UploadedImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadedImage_createdAt_idx" ON "UploadedImage"("createdAt");

-- CreateIndex
CREATE INDEX "UploadedImage_createdById_idx" ON "UploadedImage"("createdById");

-- AddForeignKey
ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GIN indexes on photos[] for fast reference-counted orphan-cleanup lookups.
-- Prisma's index DSL doesn't model GIN on text[]; appended by hand.
CREATE INDEX IF NOT EXISTS "Part_photos_gin_idx" ON "Part" USING gin ("photos");
CREATE INDEX IF NOT EXISTS "Vehicle_photos_gin_idx" ON "Vehicle" USING gin ("photos");
