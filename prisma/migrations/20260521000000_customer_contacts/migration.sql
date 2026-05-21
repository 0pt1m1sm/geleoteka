-- Secondary email/phone aliases for customers.
CREATE TYPE "ContactType" AS ENUM ('EMAIL', 'PHONE');

CREATE TABLE "CustomerContact" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "ContactType" NOT NULL,
  "value"     TEXT NOT NULL,
  "label"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerContact_type_value_key" ON "CustomerContact"("type", "value");
CREATE INDEX "CustomerContact_userId_idx" ON "CustomerContact"("userId");

ALTER TABLE "CustomerContact"
  ADD CONSTRAINT "CustomerContact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
