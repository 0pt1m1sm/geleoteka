-- Spacing попыток карантина. Панель дёргает drain каждые ~5 секунд, и без
-- отметки времени последней засчитанной попытки короткий сбой БД сжигал все
-- попытки карантина за секунды, необратимо выбрасывая живой апдейт. Попытки
-- чаще TELEGRAM_POLL_POISON_ATTEMPT_SPACING_MS теперь не считаются.
--
-- IMPORTANT: никакого постороннего дрейфа в этом файле. Part_photos_gin_idx,
-- Vehicle_photos_gin_idx и индексы StockMovement не трогаем.

ALTER TABLE "TelegramPollState"
  ADD COLUMN "stuckLastAt" TIMESTAMP(3);
