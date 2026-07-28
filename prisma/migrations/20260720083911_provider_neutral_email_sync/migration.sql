-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('RESEND', 'TIMEWEB_IMAP');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EmailIngestStatus" AS ENUM ('PENDING', 'PROCESSED', 'DUPLICATE', 'DEAD');

-- CreateEnum
CREATE TYPE "MailboxRole" AS ENUM ('INBOUND', 'OUTBOUND_ARCHIVE');

-- CreateEnum
CREATE TYPE "MailIdentityType" AS ENUM ('MANAGER', 'SHARED', 'TRANSACTIONAL', 'ARCHIVE');

-- AlterEnum
-- Additive only. Postgres allows ADD VALUE inside a transaction from v12 on,
-- and nothing in this migration writes the new value, so no split is needed.
ALTER TYPE "CommOutcome" ADD VALUE 'ACCEPTED';

-- NOTE: `prisma migrate dev` again generated DROP INDEX for the un-modelled
-- Part_photos_gin_idx / Vehicle_photos_gin_idx GIN indexes (created as raw SQL
-- in 20260505123839_add_uploaded_image; Prisma can't model GIN on String[]).
-- Those drops are intentionally OMITTED — same convention as 20260522153000,
-- 20260522191634, 20260523170231 and 20260524103113.
--
-- It also generated `ALTER INDEX "StockMovement_tenantKey_sourceType_sourceId_reason_warehouseId_"
-- RENAME TO "StockMovement_tenantKey_sourceType_sourceId_reason_warehous_key"`,
-- reconciling a name Postgres truncated at 63 chars in 20260525013449. That
-- rename is unrelated to this migration and would abort the whole deploy if the
-- production index carried a different truncation, so it is omitted too.

-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN     "emailMessageId" TEXT;

-- AlterTable
ALTER TABLE "InboxMessage" ADD COLUMN     "direction" "EmailDirection" NOT NULL DEFAULT 'INBOUND',
ADD COLUMN     "emailMessageId" TEXT,
ALTER COLUMN "resendEmailId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "direction" "EmailDirection" NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "rfcMessageId" TEXT NOT NULL,
    "rfcMessageIdSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "occurredAtEstimated" BOOLEAN NOT NULL DEFAULT false,
    "sourceMailbox" TEXT NOT NULL,
    "sourceFolder" TEXT NOT NULL,
    "uidValidity" BIGINT,
    "uid" BIGINT,
    "providerLocator" JSONB,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "ingestStatus" "EmailIngestStatus" NOT NULL DEFAULT 'PENDING',
    "ingestAttempts" INTEGER NOT NULL DEFAULT 0,
    "ingestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxSyncCursor" (
    "id" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "role" "MailboxRole" NOT NULL,
    "uidValidity" BIGINT,
    "lastUid" BIGINT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailIdentity" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "type" "MailIdentityType" NOT NULL,
    "userId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_rfcMessageId_key" ON "EmailMessage"("rfcMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_direction_occurredAt_idx" ON "EmailMessage"("direction", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailMessage_ingestStatus_occurredAt_idx" ON "EmailMessage"("ingestStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailMessage_fromEmail_idx" ON "EmailMessage"("fromEmail");

-- CreateIndex
CREATE INDEX "EmailMessage_inReplyTo_idx" ON "EmailMessage"("inReplyTo");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_provider_sourceMailbox_sourceFolder_uidValidit_key" ON "EmailMessage"("provider", "sourceMailbox", "sourceFolder", "uidValidity", "uid");

-- CreateIndex
CREATE INDEX "MailboxSyncCursor_role_idx" ON "MailboxSyncCursor"("role");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxSyncCursor_mailbox_folder_key" ON "MailboxSyncCursor"("mailbox", "folder");

-- CreateIndex
CREATE UNIQUE INDEX "MailIdentity_address_key" ON "MailIdentity"("address");

-- CreateIndex
CREATE INDEX "MailIdentity_userId_idx" ON "MailIdentity"("userId");

-- CreateIndex
CREATE INDEX "MailIdentity_isActive_idx" ON "MailIdentity"("isActive");

-- CreateIndex
CREATE INDEX "CommunicationLog_emailMessageId_idx" ON "CommunicationLog"("emailMessageId");

-- CreateIndex
CREATE INDEX "InboxMessage_emailMessageId_idx" ON "InboxMessage"("emailMessageId");

-- CreateIndex
CREATE INDEX "InboxMessage_status_direction_idx" ON "InboxMessage"("status", "direction");

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailIdentity" ADD CONSTRAINT "MailIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
