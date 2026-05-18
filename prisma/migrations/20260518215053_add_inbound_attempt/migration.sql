-- CreateTable: InboundAttempt — diagnostic audit log of every POST to
-- /api/email/inbound. Lets admin diagnose webhook chain without Railway logs.
CREATE TABLE "InboundAttempt" (
  "id"         TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "httpStatus" INTEGER NOT NULL,
  "outcome"    TEXT NOT NULL,
  "detail"     TEXT,
  "recipient"  TEXT,
  "fromEmail"  TEXT,
  "messageId"  TEXT,
  "hasSvixId"  BOOLEAN NOT NULL DEFAULT false,
  "hasSig"     BOOLEAN NOT NULL DEFAULT false,
  "hasTs"      BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "InboundAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboundAttempt_receivedAt_idx" ON "InboundAttempt"("receivedAt");
CREATE INDEX "InboundAttempt_outcome_idx" ON "InboundAttempt"("outcome");
