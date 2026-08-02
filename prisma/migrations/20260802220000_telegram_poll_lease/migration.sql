-- Single-flight lease опроса. Два параллельных getUpdates с одним токеном
-- дают 409 «terminated by other getUpdates request», неотличимый по HTTP-коду
-- от 409 «webhook is active», из-за чего перекрытие маскировалось под смену
-- режима. Lease (CAS по leaseUntil) гарантирует ровно один drain на токен;
-- протухший штамп перехватывается по времени.
--
-- IMPORTANT: никакого постороннего дрейфа в этом файле. Part_photos_gin_idx,
-- Vehicle_photos_gin_idx и индексы StockMovement не трогаем.

ALTER TABLE "TelegramPollState"
  ADD COLUMN "leaseUntil" TIMESTAMP(3);
