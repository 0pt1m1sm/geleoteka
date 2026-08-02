# Telegram polling — состояние на 2026-08-02

Ветка `claude/telegram-polling-architecture`, коммит `1853eb2` (не в main).
Локально зелено: tsc, lint, 430 тестов, build.

## Что сделано

Приём переведён с webhook на getUpdates polling (РКН режет Telegram↔РФ, webhook
таймаутил). Новое: `lib/staff-notifications/channels/telegram/updates.ts`
(транспорт), `updates-runtime.ts` (боевая обвязка), таблица `TelegramPollState`,
миграция `20260802180000_telegram_polling`. Триггеры опроса: cron-maintenance
(force) и `refreshTelegramLinkStatus` из панели привязки. Панель показывает
живой статус из нашей БД, а не ждёт ответа бота. Добавлена настройка
`TELEGRAM_API_BASE_URL` (релей вне РФ), webhook-секрет стал необязательным.

## Adversarial review codex — 10 находок

Отчёт: `.omc/artifacts/ask/codex-adversarial-review-claude-telegram-*.md`

**ПОДТВЕРЖДЕНО МНОЙ (findings #6):** миграция `20260802190000` пересоздаёт
CHECK `TelegramSendAttempt_operation_check` БЕЗ `UPDATES_POLL`. Проверил
фактическое состояние БД — в constraint только 3 старые операции. Значит
диагностика опроса не пишется вообще (исключение глотается), экран операций
пуст по polling. Чинить: новая миграция с полным списком из 4 операций.

Остальные (не перепроверял, брать с проверкой):

1. BLOCKER — 409 бывает не только от webhook, но и от параллельного getUpdates.
   Я на любой 409 зову deleteWebhook — снесу чужую регистрацию/замаскирую
   собственный overlap. Нужен single-flight lease + getWebhookInfo вместо
   слепого удаления.
2. BLOCKER — нет защиты от ядовитого апдейта: при стабильном исключении
   виновник навсегда первый в очереди, всё за ним встаёт. Нужен durable
   счётчик попыток + карантин.
5. BLOCKER — рецепт Cloudflare Worker в runbook логирует токен (observability
   включена по умолчанию, invocation log пишет полный URL, а токен в пути).
   Фраза «не логирует токен» ложна. Чинить рецепт или убрать.
3. MAJOR — `budgetMs` не wall-clock: проверяется только перед батчем, реальный
   drain может жить ~16 сек при заявленных 3.
4. MAJOR — провал опроса возвращает 200 `{ok:true}`, cron остаётся зелёным при
   мёртвом канале.
10. MAJOR — тест «stale drain» ничего не доказывает: два drain не запускаются.
7. MINOR — ответы бота в polling-обвязке фактически не awaited (scheduler
   типизирован `void`).
8. MINOR — после истечения ссылки watcher залипает в `expired`, новая ссылка
   сразу «истёкшая» (нужен `key`).
9. MINOR — `TELEGRAM_API_BASE_URL` не secret, но runbook требует беречь как
   токен; валидация не вызывается при сохранении — невалидное значение молча
   выключает канал.

## Дальше

Чинить по списку, начиная с подтверждённого #6 и трёх BLOCKER. Потом
контрольные прогоны и PR.
