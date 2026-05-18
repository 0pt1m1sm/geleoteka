-- AlterEnum: CommChannel — add directional email values.
-- PostgreSQL 12+ allows ALTER TYPE ... ADD VALUE inside a transaction as long
-- as the new value is not used in the same migration. We satisfy that here.
ALTER TYPE "CommChannel" ADD VALUE 'EMAIL_INBOUND';
ALTER TYPE "CommChannel" ADD VALUE 'EMAIL_OUTBOUND';

-- CreateEnum
CREATE TYPE "InboxMessageStatus" AS ENUM ('PENDING', 'ASSIGNED', 'SPAM', 'ARCHIVED');

-- AlterTable: CommunicationLog
ALTER TABLE "CommunicationLog"
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "resendEmailId" TEXT,
  ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';

-- DB-level idempotency for inbound email message_id (and any future provider id).
-- Nullable @unique on Postgres allows multiple NULLs (treated as distinct).
CREATE UNIQUE INDEX "CommunicationLog_externalId_key" ON "CommunicationLog"("externalId");

CREATE INDEX "CommunicationLog_resendEmailId_idx" ON "CommunicationLog"("resendEmailId");

-- CreateTable: InboxMessage — bucket for unmatched inbound senders awaiting triage.
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "messageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resendEmailId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InboxMessageStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToUserId" TEXT,
    "linkedCommunicationLogId" TEXT,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxMessage_messageId_key" ON "InboxMessage"("messageId");
CREATE UNIQUE INDEX "InboxMessage_resendEmailId_key" ON "InboxMessage"("resendEmailId");
CREATE INDEX "InboxMessage_status_receivedAt_idx" ON "InboxMessage"("status", "receivedAt");
CREATE INDEX "InboxMessage_inReplyTo_idx" ON "InboxMessage"("inReplyTo");
CREATE INDEX "InboxMessage_fromEmail_idx" ON "InboxMessage"("fromEmail");

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_linkedCommunicationLogId_fkey"
    FOREIGN KEY ("linkedCommunicationLogId") REFERENCES "CommunicationLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
