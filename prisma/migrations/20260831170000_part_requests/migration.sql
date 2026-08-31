-- Заявка «сообщить о поступлении»: посетитель нашёл деталь по номеру, а в
-- наличии её нет.
--
-- Снимок номера и названия хранится В СТРОКЕ, а связь со справочником
-- необязательная и с SET NULL. Это исторический след обращения: он обязан
-- читаться, даже если номенклатуру потом удалят. Cascade стёр бы входящие
-- обращения вместе со справочной позицией — в этом проекте такое уже
-- случалось с историей клиентов.
CREATE TABLE "PartRequest" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT,
    "oem" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "contact" VARCHAR(200) NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,

    CONSTRAINT "PartRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartRequest_referenceId_idx" ON "PartRequest"("referenceId");
CREATE INDEX "PartRequest_createdAt_idx" ON "PartRequest"("createdAt");
-- По handledAt строится рабочий список: необработанные сверху.
CREATE INDEX "PartRequest_handledAt_idx" ON "PartRequest"("handledAt");

ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_referenceId_fkey"
    FOREIGN KEY ("referenceId") REFERENCES "PartReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_handledById_fkey"
    FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
