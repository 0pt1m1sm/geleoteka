-- Восстанавливает UPDATES_POLL в операциях диагностики Telegram.
--
-- История: 20260802180000_telegram_polling добавила UPDATES_POLL в CHECK,
-- но лексикографически более поздняя 20260802190000_telegram_test_notification
-- (созданная раньше по времени) пересоздаёт тот же constraint со старым
-- списком из трёх операций. Итог в базе — CHECK без UPDATES_POLL: каждая
-- диагностическая запись опроса отбивается constraint'ом и глотается в
-- recordTelegramSendDiagnostic, экран операций по опросу пуст.
--
-- Этот файл — единственный источник правды о полном списке операций.
--
-- IMPORTANT: никакого постороннего дрейфа в этом файле. Part_photos_gin_idx,
-- Vehicle_photos_gin_idx и индексы StockMovement не трогаем.

ALTER TABLE "TelegramSendAttempt"
  DROP CONSTRAINT "TelegramSendAttempt_operation_check";

ALTER TABLE "TelegramSendAttempt"
  ADD CONSTRAINT "TelegramSendAttempt_operation_check" CHECK (
    "operation" IN (
      'NOTIFICATION_DELIVERY',
      'WEBHOOK_REPLY',
      'TEST_NOTIFICATION',
      'UPDATES_POLL'
    )
  );
