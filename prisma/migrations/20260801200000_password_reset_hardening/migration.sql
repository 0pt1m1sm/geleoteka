-- Harden the SMS password-reset credential.
--
-- Existing PasswordReset rows contain plaintext six-digit codes. Hashing an
-- unconsumed legacy code in place would preserve the very takeover window this
-- migration closes, so every outstanding row is consumed first. Historical
-- rows receive a non-matching 60-character tombstone before the plaintext
-- column is dropped; new application writes contain only bcrypt verifiers.

BEGIN;

ALTER TABLE "PasswordReset"
  ADD COLUMN "codeVerifier" VARCHAR(60),
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "PasswordReset"
SET "usedAt" = CURRENT_TIMESTAMP
WHERE "usedAt" IS NULL;

UPDATE "PasswordReset"
SET "codeVerifier" = repeat('0', 60);

DROP INDEX "PasswordReset_code_idx";
DROP INDEX "PasswordReset_userId_idx";

ALTER TABLE "PasswordReset"
  ALTER COLUMN "codeVerifier" SET NOT NULL,
  DROP COLUMN "code";

CREATE INDEX "PasswordReset_userId_createdAt_idx"
  ON "PasswordReset"("userId", "createdAt" DESC);

COMMIT;
