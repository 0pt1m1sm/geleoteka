-- Harden the SMS password-reset credential.
--
-- Existing PasswordReset rows contain plaintext six-digit codes. Hashing an
-- unconsumed legacy code in place would preserve the very takeover window this
-- migration closes, so every outstanding row is consumed first. Historical
-- rows receive a non-matching 64-character tombstone before the plaintext
-- column is dropped; new application writes contain only real SHA-256 digests.

BEGIN;

ALTER TABLE "PasswordReset"
  ADD COLUMN "codeHash" VARCHAR(64),
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "PasswordReset"
SET "usedAt" = CURRENT_TIMESTAMP
WHERE "usedAt" IS NULL;

UPDATE "PasswordReset"
SET "codeHash" = repeat('0', 64);

DROP INDEX "PasswordReset_code_idx";

ALTER TABLE "PasswordReset"
  ALTER COLUMN "codeHash" SET NOT NULL,
  DROP COLUMN "code";

CREATE INDEX "PasswordReset_userId_codeHash_idx"
  ON "PasswordReset"("userId", "codeHash");

COMMIT;
