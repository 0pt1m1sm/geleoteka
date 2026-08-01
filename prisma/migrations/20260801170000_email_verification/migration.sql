-- Email verification is additive and intentionally performs no backfill.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "tenantKey" TEXT NOT NULL DEFAULT 'geleoteka',
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tenantKey_tokenHash_key"
  ON "EmailVerificationToken"("tenantKey", "tokenHash");
CREATE INDEX "EmailVerificationToken_tenantKey_userId_createdAt_idx"
  ON "EmailVerificationToken"("tenantKey", "userId", "createdAt");
CREATE INDEX "EmailVerificationToken_tenantKey_expiresAt_usedAt_idx"
  ON "EmailVerificationToken"("tenantKey", "expiresAt", "usedAt");

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
