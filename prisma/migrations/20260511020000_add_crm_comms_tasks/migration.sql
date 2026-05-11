-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('PHONE_INBOUND', 'PHONE_OUTBOUND', 'SMS_OUTBOUND', 'SMS_INBOUND', 'WHATSAPP', 'TELEGRAM', 'EMAIL', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "CommOutcome" AS ENUM ('ANSWERED', 'VOICEMAIL', 'NO_ANSWER', 'REPLIED', 'DELIVERED', 'FAILED', 'N_A');

-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmTaskKind" AS ENUM ('CALLBACK', 'FOLLOW_UP', 'PAYMENT_REMINDER', 'SCHEDULED_CHECK_IN', 'GENERIC');

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "dealId" TEXT,
    "channel" "CommChannel" NOT NULL,
    "outcome" "CommOutcome" NOT NULL DEFAULT 'N_A',
    "body" TEXT,
    "durationSec" INTEGER,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "kind" "CrmTaskKind" NOT NULL DEFAULT 'GENERIC',
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "customerUserId" TEXT,
    "dealId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationLog_customerUserId_createdAt_idx" ON "CommunicationLog"("customerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_dealId_idx" ON "CommunicationLog"("dealId");

-- CreateIndex
CREATE INDEX "CommunicationLog_channel_idx" ON "CommunicationLog"("channel");

-- CreateIndex
CREATE INDEX "CrmTask_ownerUserId_status_dueAt_idx" ON "CrmTask"("ownerUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_customerUserId_idx" ON "CrmTask"("customerUserId");

-- CreateIndex
CREATE INDEX "CrmTask_dealId_idx" ON "CrmTask"("dealId");

-- CreateIndex
CREATE INDEX "CrmTask_dueAt_idx" ON "CrmTask"("dueAt");

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

