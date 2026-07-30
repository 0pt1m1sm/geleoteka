-- The public team roster becomes ordinary site content, edited beside vacancies,
-- instead of being derived from User.isMaster + MasterProfile.
--
-- Why: who is shown on the website is a marketing decision, while isMaster and
-- MasterProfile decide who can be assigned to a repair order and who reaches the
-- master portal. Deriving one from the other meant the same person was edited in
-- two places, and a roster change could disturb an account.
--
-- MasterProfile is intentionally LEFT IN PLACE: it still serves the portal and
-- the repair-order assignment. This migration only stops it from driving the
-- public page, and copies whatever is already there so the site keeps showing
-- the same people after deploy.
--
-- Additive: one new table plus a data copy. Nothing is dropped.

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "yearsExperience" INTEGER,
    "certifications" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMember_isActive_idx" ON "TeamMember"("isActive");

-- CreateIndex
CREATE INDEX "TeamMember_sortOrder_idx" ON "TeamMember"("sortOrder");

-- Carry the existing roster across so /about does not go blank on deploy.
INSERT INTO "TeamMember" ("id", "name", "role", "bio", "photoUrl", "yearsExperience", "certifications", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    u."name",
    mp."specialty",
    mp."bio",
    mp."photoUrl",
    mp."yearsExperience",
    COALESCE(mp."certifications", ARRAY[]::text[]),
    COALESCE(mp."isActive", true),
    COALESCE(mp."sortOrder", 0),
    now(),
    now()
FROM "User" u
JOIN "MasterProfile" mp ON mp."userId" = u."id"
WHERE u."isMaster" = true AND u."deletedAt" IS NULL;
