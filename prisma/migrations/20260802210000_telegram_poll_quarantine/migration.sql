-- Карантин ядовитого апдейта. Стабильно падающий update оставался первым в
-- очереди навсегда (офсет не двигается) и блокировал всё за собой — например,
-- команды привязки истекали за 30 минут. Durable-счётчик попыток позволяет
-- после N подряд неудач продвинуть курсор мимо виновника с диагностической
-- записью UPDATE_QUARANTINED. Хранится только update_id — никакого
-- содержимого апдейта.
--
-- IMPORTANT: никакого постороннего дрейфа в этом файле. Part_photos_gin_idx,
-- Vehicle_photos_gin_idx и индексы StockMovement не трогаем.

ALTER TABLE "TelegramPollState"
  ADD COLUMN "stuckUpdateId" BIGINT,
  ADD COLUMN "stuckAttempts" INTEGER NOT NULL DEFAULT 0;
