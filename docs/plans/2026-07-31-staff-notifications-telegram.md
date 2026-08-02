# Уведомления сотрудников и Telegram Implementation Plan

Created: 2026-07-31
Status: COMPLETE
Mode: auto
Iterations: 0
Type: Feature

## Задача

Письмо от известного клиента приходит в CRM и заводит `CrmTask(FOLLOW_UP)` со сроком
+4 часа — но узнать о нём можно только зайдя в админку. Бейдж в сайдбаре
(`RepliesBadge`) персональный, поэтому задача, упавшая на фолбэк-владельца, для
остальных менеджеров невидима.

Нужен слой уведомлений сотрудников с адаптерами каналов (первый — Telegram),
а не «телеграм-модуль».

## Три сущности с разной семантикой

Их нельзя схлопывать — это главное решение плана:

1. `CommunicationLog` — архив переписки.
2. `CrmTask(FOLLOW_UP)` — обязательство ответить. Снимается только выполнением.
3. `StaffNotificationEvent` — сигнал «произошло важное». Прочтение уведомления
   НЕ закрывает задачу; открытие карточки клиента не считается ответом.

## Канал-нейтральность — сквозное требование

Сегодня входящий канал один — email. Дальше добавятся WhatsApp и Telegram
(сообщения в общий канал или боту); как именно — решим позже, но закладываться
надо сейчас.

`CommChannel` это уже предвидел: в enum есть `WHATSAPP_INBOUND`,
`TELEGRAM_INBOUND`, `MAX_INBOUND`, `SMS_INBOUND`, `PHONE_INBOUND`. Значит
канал-нейтральный якорь у нас уже есть, и это `CommunicationLog`, а не
`EmailMessage`.

Отсюда обязательные следствия для всех историй:

- Тип события — `INBOUND_CUSTOMER_MESSAGE` с полем канала, НЕ
  `INBOUND_CUSTOMER_EMAIL`. Один тип на все входящие каналы; канал — атрибут.
- `dedupeKey` строится по `CommunicationLog.id`, НЕ по `EmailMessage.id`:
  у сообщения из WhatsApp никакого `EmailMessage` не будет.
- Поле в `CrmTask` (Story 3) называется `lastInboundCommLogId` и ссылается на
  `CommunicationLog`, НЕ `lastInboundEmailMessageId`.
- Точка публикации — «появился входящий `CommunicationLog`», а не «принято
  письмо». Адаптер канала (IMAP сегодня, WhatsApp/Telegram завтра) делает свою
  специфичную работу и вызывает ОДИН общий публикатор.
- Тексты задач и уведомлений не говорят «письмо» безусловно: формулировка
  выбирается по каналу. Сейчас `ensureFollowUpTask` пишет «Клиент ответил по
  email» жёстко.
- Существующая `EmailMessage`-дедупликация в `ingestEmail` остаётся — она про
  транспорт и живёт в адаптере, а не в слое уведомлений.

## Целевая модель входящих каналов (закладываем сейчас, строим позже)

У CRM будет свой номер, на который приходят обращения из Telegram и WhatsApp.
Тот же номер добавляется вторым аккаунтом на телефоны менеджеров. Платформа
опрашивает этот аккаунт так же, как почтовый ящик, и раскладывает сообщения по
клиентам либо в очередь разбора. Схема — зеркало почтовой.

**Три четверти позвоночника уже готовы:**

- `CommunicationLog` — канал-нейтральный, `CommChannel` покрывает все каналы.
- `CustomerContact` — `type ContactType { EMAIL, PHONE }`, `value` нормализован
  (`normalizePhone` в `lib/utils.ts:89`), уникальность `[type, value]`.
  Сопоставление отправителя по номеру возможно уже сегодня.
- Логика резолвера (`тред → отправитель → в разбор`) по смыслу от канала не
  зависит; к почте её привязывают только поля, а не идея.

**Что НЕ готово — `InboxMessage`.** Очередь «Новые» насквозь почтовая:
`fromEmail`, `toEmail`, `messageId`, `inReplyTo`, `references[]`, `resendEmailId`,
`emailMessageId`, `direction EmailDirection`. Сообщение из WhatsApp туда не
положить. Обобщение этой очереди — главная работа при добавлении второго канала.

**Раскладка по слоям, повторяющая почтовую:**

| Слой | Сейчас | Дальше |
|---|---|---|
| Транспортный архив | `EmailMessage` | `TelegramMessage`, `WhatsAppMessage` — свой конверт у каждого канала, это правильно |
| Нормализованный DTO | `ParsedEmail` | `ParsedMessage` |
| Приём | `lib/email/ingest.ts` | один общий ingest |
| Резолв | `lib/email/resolve.ts` | один общий resolve |
| Очередь разбора | `InboxMessage` (почтовая) | нейтральная очередь |

### Два внешних ограничения

**1. Telegram: бот этого не умеет.** Принимать сообщения, которые клиенты пишут
на НОМЕР, может только пользовательский аккаунт по MTProto (Telethon/GramJS).
У бота нет номера, и он получает сообщения только от тех, кто нажал Start.
Значит входящий канал — user-аккаунт, а не бот.

Мультидевайс у Telegram штатный, поэтому «тот же аккаунт вторым на телефонах
менеджеров» работает — и это ровно тот же приём, что у нас с почтой: менеджер
отвечает из приложения, CRM забирает обе стороны из общего аккаунта, как сейчас
забирает исходящие из папки «Отправленные».

Риск честно: автоматизацию user-аккаунтов Telegram не поощряет, за рассылки
аккаунты ограничивают. Для приёма и архивирования риск умеренный, но он есть, и
блокировка такого аккаунта = потеря входящего канала целиком.

Бот для уведомлений сотрудникам (Story 4) — ОТДЕЛЬНАЯ интеграция. Хорошо, что
они уже разведены: это разные API, разные секреты, разный жизненный цикл.

**2. WhatsApp: два пути, и надо выбрать.**

Ранее здесь было написано, что описанная схема «не сработает». Это была ошибка:
ограничения официального Cloud API были распространены на весь WhatsApp. Схема
работает, и рынок делает её именно так.

| | Cloud API (Meta) | Связанное устройство (QR) |
|---|---|---|
| Подключение | верификация в Meta, номер выделен под API | скан QR, ~2 минуты |
| Номер в приложении на телефонах | НЕЛЬЗЯ | можно, это и есть мультидевайс |
| Телефон выключен | не при чём | синхронизация продолжается (мультидевайс с 2021) |
| Отправка | шаблоны + окно 24 ч, оплата за диалог | как обычная переписка |
| Легальность | официально, риск блокировки нулевой | нарушение условий WhatsApp |
| Риск | — | блокировка без предупреждения, часто навсегда |

Второй столбец — ровно схема владельца: общий номер CRM, он же вторым аккаунтом
на телефонах менеджеров. Так работает TimelinesAI (подключение по QR, обычный
номер, без Business API) и аналогичные провайдеры.

Риск неофициального пути реален, но профиль у нас щадящий: входящие обращения и
ответы живых менеджеров, без рассылок. Массовые рассылки — вот что банят в первую
очередь. Тем не менее цена реализации риска — потеря номера CRM целиком.

**Протокол НЕ пишем сами.** Берём провайдера (TimelinesAI, Wazzup, Radist,
Green API, 1msg): он даёт HTTP API и вебхуки, у нас это ещё один адаптер канала.
Работы дни вместо месяцев; риск блокировки — на обкатанной чужой реализации;
всё по HTTPS, что важно при заблокированном на Timeweb SMTP. Смена провайдера
или переход на Cloud API меняет ТОЛЬКО адаптер — `CommunicationLog`, резолвер и
очередь разбора не трогаются. Это и есть главная причина держать границу
«ядро / адаптер» чистой.

Тот же провайдер обычно закрывает и Telegram — тогда снимается довод про
MTProto-аккаунт из пункта 1.

**Решить до реализации канала:** официальный Cloud API (безопасно, но менеджеры
отвечают только через CRM) или QR-связка через провайдера (совпадает с моделью
владельца, но против условий WhatsApp).

Источники:
[TimelinesAI: API vs CRM integration](https://timelines.ai/whatsapp-business-api-vs-crm-integration-key-differences/),
[как выбрать CRM для WhatsApp](https://timelines.ai/how-to-choose-crm-for-whatsapp-integration),
[разбор рисков неофициальных инструментов](https://www.bot.space/blog/whatsapp-api-vs-unofficial-tools-a-complete-risk-reward-analysis-for-2025),
[официальный против неофициального API](https://blog.omnichat.ai/unofficial-whatsapp-business-api/).

## Решения владельца (перекрывают план)

**Состав сообщения в Telegram.** Codex предлагал не отправлять даже имя клиента
и тему письма. Владелец выбрал компромисс: **имя клиента и номер сделки — можно,
тема и тело письма — нельзя**.

```
📬 Новое письмо от клиента          ← формулировка по каналу:
Егор Атюков · сделка №1042             «письмо» / «сообщение в WhatsApp» / …
Ответить до 03:15

https://geleoteka.ru/admin/crm/deals/1042
```

Остальные запреты §D остаются в силе без изменений: тема, тело, телефон, адрес,
email, госномер, VIN, имя файла вложения, причина отказа, любые URL из письма или
пользовательского ввода.

**Объём.** Полный план, все шесть шагов.

## Progress Tracking

- [x] Story 1: Видимость в CRM без миграций (Status: DONE — PR #43, 19a1b81)
- [x] Story 2: Схема и ядро в dark mode (Status: DONE — PR #44, 4fac11a)
- [x] Story 3: Письмо → durable event → лента (Status: DONE — PR #46, fe700a6)
- [x] Story 4: Telegram-адаптер и привязка (Status: DONE — PR #47, 9e513af)
- [x] Story 5: Остальные события P0/P1 (Status: DONE — PR #48, 42f4323)
- [x] Story 6: Просрочки и эксплуатация (Status: DONE — PR #49, 88fb72e)

## Implementation Tasks

### Story 1: Видимость в CRM без миграций

**Objective.** Закрыть невидимость для менеджеров, не заводя ни одной таблицы.
Это то, что можно выкатить на живой сервис сегодня.

**Files.** `app/(admin)/admin/crm/tasks/`, `components/admin/replies/RepliesBadge.tsx`,
`lib/crm/auto-task.ts`, `components/crm/CrmTaskList.tsx`.

**Tasks.**
- Read-only проверка на проде: сколько сейчас открытых `FOLLOW_UP`, кому назначены,
  сколько висит на фолбэк-владельце. Без этого нельзя утверждать, что механизм жив.
- Фильтр «Ответы клиентов» на `/admin/crm/tasks` — командный, не только «мои».
- Счётчик по команде рядом с персональным: сейчас видно только своё.
- Из задачи — прямой переход к письму. Сегодня в теле только «откройте сделку»,
  ссылки на `CommunicationLog`/`EmailMessage` у `CrmTask` нет вовсе.
- Починить фолбэк владельца: сейчас `pickTaskOwner` берёт первого ADMIN по
  `createdAt` — детерминированно, но произвольно. Неназначенная задача должна
  попадать в командную очередь, а не персонально одному человеку.

**DoD.** Менеджер видит чужие и неназначенные ответы клиентов; из задачи
попадает в письмо одним переходом; ни одной миграции.

### Story 2: Схема и ядро в dark mode

**Objective.** Additive-схема и ядро слоя, ничего не меняющие в поведении прода.

**Files.** `prisma/schema.prisma`, `prisma/migrations/<ts>_staff_notifications/migration.sql`,
`lib/staff-notifications/{types,publish,router,dispatcher,safe-action-url}.ts`,
`lib/staff-notifications/channels/index.ts`.

**Модели.** Все с `tenantKey`, все уникальности составные:
`StaffNotificationEvent`, `StaffNotificationReceipt`, `StaffNotificationDelivery`,
`TelegramDestination`, `TelegramLinkToken`, `TelegramUpdateReceipt`.

`type` и `channel` — строки с закрытым TS-каталогом (как `AuditAction` в
`lib/audit.ts`), чтобы новый тип события не требовал миграции PG-enum. Статусы
доставки — настоящий enum: `PENDING`, `PROCESSING`, `RETRY`, `SENT`, `DEAD`, `CANCELLED`.

**Tasks.**
- Миграция пишется РУКАМИ (`migrate dev` требует сброса из-за известного дрейфа).
  В `migration.sql` не должно попасть: снос `Part_photos_gin_idx`,
  `Vehicle_photos_gin_idx`, переименование индекса `StockMovement`.
- Все флаги Telegram по умолчанию `false`, backfill не делаем.
- `safe-action-url.ts`: только внутренние `/admin/...`, query string запрещён.

**DoD.** `migrate deploy` проходит на копии прод-схемы, GIN-индексы целы,
поведение прода не изменилось ни в одном сценарии.

### Story 3: Письмо → durable event → лента

**Objective.** Событие пишется в той же транзакции, что и письмо; проектор после
коммита создаёт задачу и получателей.

**Files.** `lib/email/ingest.ts`, `lib/staff-notifications/projectors/inbound-email-task.ts`,
`app/(admin)/admin/notifications/`, `app/actions/crm/inbox.ts`, `prisma/schema.prisma`.

**Tasks.**
- Общий публикатор `publishInboundCustomerMessage(...)`, вызываемый в той же
  транзакции, где создан входящий `CommunicationLog`. Сегодня его зовёт
  email-адаптер из `ingestEmail` после `resolveInboundEmail`; завтра — адаптеры
  WhatsApp/Telegram, без изменений в слое уведомлений.
- Событие: `type="INBOUND_CUSTOMER_MESSAGE"`, поле канала из `CommChannel`,
  `dedupeKey="inbound-msg:<CommunicationLog.id>"`, `sourceType="CommunicationLog"`,
  `sourceId`, `relatedCustomerUserId`, `relatedDealId`, `occurredAt`.
  Ключ идемпотентности — СООБЩЕНИЕ, не задача: повторное письмо обновляет
  задачу, но обязано дать новый сигнал.
- Проектор после коммита: receipts + идемпотентный `FOLLOW_UP` + delivery rows.
  Ошибка оставляет event в `PENDING` — в отличие от нынешнего best-effort, где
  сбой `ensureFollowUpTask` только логируется.
- `CrmTask.lastInboundCommLogId String?` → `CommunicationLog`. `sendEmailReply`
  (`app/actions/crm/inbox.ts:215`) закрывает FOLLOW_UP только CAS-обновлением по
  этому ID: если за время отправки пришло новое сообщение, задача остаётся
  открытой. Имя поля канал-нейтральное: тем же механизмом закроется ответ в
  WhatsApp.
- Формулировки задачи и уведомления выбираются по каналу. Сейчас
  `ensureFollowUpTask` жёстко пишет «Клиент ответил по email».
- Лента `/admin/notifications` с per-user прочтением и бейджем непрочитанного.
- Только после этого убрать best-effort вызов `ensureFollowUpTask` из `ingestEmail`.

**DoD.** Повторная синхронизация не плодит событий; второе письмо клиента даёт
второй сигнал; прочтение ленты не закрывает задачу; ответ закрывает.

### Story 4: Telegram-адаптер и привязка

**Objective.** Первое сообщение доходит до сотрудника.

**Files.** `lib/staff-notifications/channels/telegram/`,
`app/api/integrations/telegram/webhook/route.ts`,
`app/api/internal/staff-notifications/dispatch/route.ts`,
`app/(admin)/admin/notifications/telegram/`, `lib/settings.ts`, `lib/permissions.ts`,
`proxy.ts`.

**Привязка.** Личное сообщение владельцу; общий служебный чат — fallback для
неназначенных. Токен привязки: 24–32 случайных байта, хранится ТОЛЬКО SHA-256,
TTL задаётся `TELEGRAM_LINK_TOKEN_TTL_MS`, одноразовый. Deep-link
`https://t.me/<bot>?start=<token>`. Webhook
проверяет `X-Telegram-Bot-Api-Secret-Token`, `update_id` и что чат приватный.
`chat_id` никогда не принимается из браузера и не показывается в UI обратно.

**Надёжность.** HTTP наружу — только вне транзакции, после короткого DB-lease.
Ретраи ~`1m → 5m → 15m → 1h → 6h`, до 8–10 попыток, для `429` соблюдать
`retry_after`. `400 chat not found` и `403 bot blocked` — постоянные: destination
отключается, delivery → `DEAD`. Диспетчер дёргается внешним cron по образцу
`mail-sync-cron.yml`, аутентификация constant-time Bearer. `after()` — только
ускоритель, корректность на нём не строить.

**Настройки** (`KNOWN_SETTINGS`): `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`
(`secret`), `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (`secret`),
`TELEGRAM_ROUTING_MODE`, `STAFF_NOTIFICATION_DISPATCH_SECRET` (`secret`), плюс
булев переключатель на каждый тип события. Добавить `SettingDescriptor.input`
(`text | secret | boolean | select`) и серверную валидацию. Отсутствующее или
повреждённое значение = `false`, а не «включено».

**Права.** `notifications.view` (своя лента и личная привязка, default MANAGER),
`notifications.manage` (общие чаты, dead-letter, повтор, default только ADMIN).
Токен и глобальные переключатели — под `settings.manage`. Получатель обязан иметь
И `notifications.view`, И доменное право события. API — через `requireApiPermission`;
webhook и диспетчер — по собственным секретам. Оба маршрута исключить из
авторизации в `proxy.ts`.

**Состав сообщения — по решению владельца:** имя клиента и номер сделки можно;
тема, тело, телефон, адрес, госномер, VIN, имя вложения, причина отказа и любые
URL из письма — нельзя. Ссылка строится только `makeAdminActionUrl()` из
внутренних ID.

**DoD.** Sentinel-тест: `claimToken` кладётся в тему, тело и причину отказа и
проверяется его отсутствие в payload доставки, в логах и в тексте ошибок.
Выкатка ступенями: один тестовый ADMIN → служебный чат → личные привязки.

### Story 5: Остальные события P0/P1

**Objective.** Остальные важные события идут тем же слоем.

| Приоритет | Тип | Получатели |
|---|---|---|
| P0 | `SERVICE_BOOKING_CREATED` | `service.manage` |
| P0 | `ESTIMATE_CUSTOMER_APPROVED` | владелец сделки, иначе `crm.manage` |
| P0 | `ESTIMATE_CUSTOMER_DECLINED` | владелец сделки; причина только в CRM |
| P1 | `PARTS_ORDER_CREATED` | `parts.manage` |
| P1 | `RENTAL_BOOKING_CREATED` | `rentals.manage` |
| P1 | `INBOUND_MESSAGE_UNRESOLVED` | `crm.manage`, общий чат разбора |

**Files.** `app/actions/booking.ts`, `app/actions/part-orders.ts`,
`app/actions/rentals.ts`, `app/actions/customer-estimates.ts`, `lib/email/resolve.ts`.

**DoD.** Каждый producer публикует событие ТОЛЬКО в той транзакции, где
окончательно создаётся или меняется бизнес-сущность.

### Story 6: Просрочки и эксплуатация

**Objective.** `CRM_TASK_OVERDUE` и всё, что нужно, чтобы этим можно было
управлять, а не только запустить.

**Tasks.**
- Идемпотентный сканер просрочек, ключ `task-overdue:<taskId>:<dueAt>`.
- Экран pending/retry/dead, ручной повтор под `notifications.manage`.
- Retention событий и доставок.
- Метрики без PII, canary и runbook отключения.
- Исторические события после включения НЕ рассылать.

**Спорное, решить отдельно.** SLA сейчас — четыре астрономических часа, календаря
рабочих часов нет. На первом этапе оставляем 4 часа; ночи и выходные — отдельное
решение.

## Что НЕ делать

- Не расширять клиентскую `Notification`: другой enum, другой каскад, другая
  семантика прочтения.
- Не превращать `InboxMessage` во вторую очередь для уже разобранных писем.
- Не считать `CommunicationLog.readAt` состоянием команды.
- Не закрывать `FOLLOW_UP` при прочтении уведомления или открытии карточки.
- Не писать бизнес-события в `AuditLog` — туда только административные действия
  (привязка/отвязка/ручной повтор).
- Не логировать Bot API URL, токен, `chat_id` и raw update.
- Не считать Telegram источником истины: сообщения пересылают и фотографируют,
  и они остаются после удаления из CRM.

## Источник

План: `.omc/artifacts/ask/codex-crm-next-js-16-app-router-prisma-6-postgresql-1-imap-github--2026-07-31T21-16-10-486Z.md`
Все ссылки на файлы в нём проверены и точны.
