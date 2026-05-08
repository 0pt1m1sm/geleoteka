-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTagAssignment" (
    "customerUserId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTagAssignment_pkey" PRIMARY KEY ("customerUserId","tagId")
);

-- CreateIndex
CREATE INDEX "CustomerNote_customerUserId_idx" ON "CustomerNote"("customerUserId");

-- CreateIndex
CREATE INDEX "CustomerNote_authorUserId_idx" ON "CustomerNote"("authorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_name_key" ON "CustomerTag"("name");

-- CreateIndex
CREATE INDEX "CustomerTag_name_idx" ON "CustomerTag"("name");

-- CreateIndex
CREATE INDEX "CustomerTagAssignment_tagId_idx" ON "CustomerTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "User_isCustomer_permissionRole_idx" ON "User"("isCustomer", "permissionRole");

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: ensure every existing customer (isCustomer=true) has a CustomerProfile row.
-- After this migration, register.ts and lib/customer-onboarding.ts also create
-- the profile inline at user-create time, so the invariant holds going forward.
INSERT INTO "CustomerProfile" ("userId")
SELECT "id" FROM "User" WHERE "isCustomer" = true
ON CONFLICT ("userId") DO NOTHING;
