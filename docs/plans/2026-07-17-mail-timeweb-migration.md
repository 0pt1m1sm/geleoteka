# Миграция почты с Resend на Timeweb Mail

Created: 2026-07-17
Author: aleksandr.spiskov@gmail.com
Agent: Codex
Status: CODE COMPLETE — Story 1–5 VERIFIED; Task 6–7 (операционный катовер) за пользователем
Mode: auto
Approved: Yes (код-задачи Task 1–5; Task 6–7 остаются за пользователем)
Iterations: 5

> **⚠️ КРИТИЧНАЯ ОПЕРАЦИОННАЯ ЗАМЕТКА ПЕРЕД ДЕПЛОЕМ (Task 6):** дефолт `EMAIL_TRANSPORT=smtp`. Если задеплоить этот код в прод БЕЗ явного `EMAIL_TRANSPORT=resend` и без заданных `SMTP_USER`+`SMTP_PASSWORD`, транзакционная отправка уйдёт в smtp-mock (письма ЛОГИРУЮТСЯ, но НЕ отправляются — тихо). Чтобы прод продолжил слать через Resend до катовера — выставить `EMAIL_TRANSPORT=resend` в конфиге приложения ДО деплоя. Переключение на SMTP — осознанный шаг катовера с заданными SMTP-кредами. Ничего не закоммичено — весь код в рабочем дереве.
Worktree: No
Type: Infrastructure / CRM

## Summary

**Goal:** дать каждому менеджеру полноценный ящик `@geleoteka.ru` в Timeweb с работой через IMAP/SMTP и стандартные мобильные клиенты, при этом не потерять транзакционные отправки, историю переписки в CRM и автоматические задачи по входящим ответам. Почта менеджеров должна продолжать работать напрямую через Timeweb, даже если приложение Geleoteka временно недоступно; после восстановления приложение догоняет пропущенные письма по IMAP.

**Chosen target:** поэтапный гибрид.

1. Timeweb становится единственным MX для `geleoteka.ru` и хранит реальные ящики `info@geleoteka.ru`, менеджеров и технический `crm-archive@geleoteka.ru`.
2. Resend на первом этапе остаётся только транспортом транзакционных писем и ответов, отправленных из CRM. Видимый `From` остаётся `Geleoteka <info@geleoteka.ru>`, `Reply-To` указывает на реальный Timeweb-ящик `info@geleoteka.ru`.
3. Для каждого человеческого/общего ящика в Timeweb настраиваются серверная копия входящих в `crm-archive@geleoteka.ru` и «Контроль исходящих» в тот же архив. Приложение читает один архивный ящик по IMAP и импортирует обе стороны переписки.
4. Если ручной preflight докажет, что Timeweb меняет критичные заголовки при пересылке или не сохраняет письмо в исходном ящике, fallback — прямой IMAP-опрос `INBOX` и `Sent` каждого ящика; клиентский BCC не является допустимым основным механизмом.
5. SMTP Timeweb реализуется и тестируется как ручной переключаемый transport, но production остаётся на Resend до отдельного решения по лимитам и доставляемости. Автоматический fallback между провайдерами запрещён из-за риска двойной отправки.

**Why:** это разделяет отказоустойчивость человеческой почты и доступность платформы. Timeweb принимает и хранит переписку независимо от Next.js; Resend продолжает делать то, для чего текущий код уже написан; CRM получает provider-neutral ingestion с replay по IMAP UID, а не зависит от одноразового webhook. Перенос SMTP и inbound одновременно дал бы слишком большой blast radius и не добавил бы менеджерам устойчивости сверх уже полученных Timeweb-ящиков.

Оценка: **5–8 рабочих дней разработки + 7–14 дней наблюдения**, без учёта ответа поддержки Timeweb и ручной настройки телефонов.

## Goals

- Полноценные отдельные ящики менеджеров на `geleoteka.ru`; IMAP/SMTP с телефона и webmail Timeweb.
- Общий `info@geleoteka.ru` остаётся рабочим адресом и `Reply-To` транзакционных писем.
- Все новые входящие и исходящие письма менеджеров попадают в CRM с сохранением направления, темы, тела, заголовков threading и вложений.
- Известный входящий ответ создаёт/обновляет одну `FOLLOW_UP`-задачу по текущему SLA; исходящая копия задачу не создаёт.
- При простое приложения письма продолжают приниматься и отправляться через Timeweb; после восстановления синк воспроизводит backlog без дублей.
- Переход выполняется additively: старый Resend webhook и legacy-вложения остаются читаемыми до окончания периода наблюдения.

## Out of Scope

- Маркетинговые рассылки, unsubscribe/preferences и массовая отправка.
- Полноценный helpdesk с SLA, очередями операторов и shared-inbox locking.
- Автоматический provider failover для исходящего письма: неоднозначный timeout после передачи письма может привести к дублю.
- Синхронизация календарей/контактов через CalDAV/CardDAV.
- Перенос логина пользователей или auth на почтовые ящики Timeweb.
- Удаление legacy Resend-полей и webhook в первой поставке; это отдельная cleanup-задача после soak period.
- Гарантия финальной доставки только по ответу SMTP/API. Текущий `DELIVERED` фактически означает «Resend принял запрос», а не «письмо оказалось во входящих»; план исправляет терминологию на `ACCEPTED`, но настоящая доставка подтверждается только provider event/DSN.

## Current-State Inventory

### Исходящая почта

| Поток | Живой файл / функция | Письмо и CRM-связь |
|---|---|---|
| Общий transport | `lib/email/send.ts:71` — `sendEmail` | Прямой `fetch` в `POST https://api.resend.com/emails`; настройки берутся через `getSetting`. Без `RESEND_API_KEY` работает mock. `Reply-To` жёстко задан как `info@geleoteka.ru`. Поддерживает `Message-Id`, `In-Reply-To`, `References`. |
| Журнал исходящих | `lib/email/log.ts` — `generateOutboundMessageId`, `recordOutboundEmail`, `markOutboundEmailSent`, `markOutboundEmailFailed` | До отправки создаёт `CommunicationLog(EMAIL_OUTBOUND)` с `externalId=<...@geleoteka.ru>`; после HTTP 200 ставит `DELIVERED`, при ошибке — `FAILED`. |
| Запись в сервис | `app/actions/booking.ts:170–211` — `createRepairOrder` | Подтверждение даты, автомобиля, услуг и адреса; связано с customer + deal; параллельно отправляется SMS. |
| Регистрация | `app/actions/register.ts:56–92` — `register` | Welcome + ссылка `/login`; связано с customer без deal. |
| Заказ запчастей | `app/actions/part-orders.ts:190–241` — `createPartOrder` | Состав, номер, сумма и ссылка кабинета для авторизованного клиента; связано с customer + deal. |
| Аренда | `app/actions/rentals.ts:319–368` — `createRentalBooking` | Машина, даты, сумма, адрес выдачи; связано с customer + deal. |
| Смета | `app/actions/crm/estimates.ts:166–226` — `sendEstimate` | Сумма, срок, публичная/cabinet-ссылка и PDF; author = менеджер, связано с customer + deal. |
| Ответ из CRM | `app/actions/crm/inbox.ts:198–268` — `sendEmailReply` | Находит последнее `EMAIL_INBOUND`, строит `Re:`, пишет исходящий лог до отправки и передаёт threading headers в Resend. |
| Диагностика | `app/actions/settings.ts:85–158` — `sendTestEmail`; `components/admin/settings/TestSendButton.tsx` | Тестирует именно Resend и показывает источник API key / effective From. После provider abstraction должен стать transport-aware. |
| Templates | `lib/email/helpers.ts`; `lib/email/templates/{booking-confirmation,registration-welcome,part-order-confirmation,rental-booking-confirmation,estimate-sent}.ts`; `_layout.ts` | Пять typed helper-ов и пять HTML/text-шаблонов. Transport менять под их существующим API, шаблоны не переписывать. |

`isPlausibleEmail` в `lib/email/send.ts` отбрасывает reserved/test адреса. Все пять транзакционных call site сначала записывают threading anchor, затем выполняют fire-and-forget send и меняют outcome. Этот порядок сохраняется.

`lib/email/index.ts` — barrel, через который call sites получают helpers и функции журнала; его публичные exports нужно сохранить совместимыми на время transport refactor.

### Входящая почта

| Участок | Живой файл / функция | Текущий контракт |
|---|---|---|
| Webhook | `app/api/email/inbound/route.ts:63` — `POST` | Принимает только Resend `email.received`, проверяет Svix HMAC, recipient и дубли, затем отдельным Resend API-запросом получает body/headers. Каждый исход логируется в `InboundAttempt`. |
| Resend adapter | `lib/email/inbound.ts` | Resend-типы, HMAC, recipient filter, парсинг адреса/headers и `fetchResendEmailContent`. Это provider adapter, а не будущий доменный слой. |
| Resolution | `lib/email/resolve.ts:28` — `resolveInboundEmail` | Waterfall: `In-Reply-To → CommunicationLog.externalId`; затем sender → `User.email`/`CustomerContact(EMAIL)` и последний открытый deal; иначе `InboxMessage(PENDING)`. |
| Неизвестные письма | `app/(admin)/admin/crm/inbox/*`; `app/actions/crm/inbox.ts`; `components/admin/inbox/*`; `/api/admin/inbox/count` | Менеджер связывает письмо с клиентом/deal, добавляет sender как secondary email, либо помечает spam/archive. `InboxMessage` сохраняется для аудита. |
| Вложения | `app/api/admin/inbox/attachments/[id]/route.ts`; `CommunicationLogger.tsx`; inbox detail page | Метаданные лежат в JSON, содержимое запрашивается у Resend по `resendEmailId`; route полностью provider-specific. По комментарию кода Resend хранит вложения около 30 дней. |
| Timeline/read state | `components/crm/CommunicationLogger.tsx`; `app/actions/crm/communications.ts:markRepliesRead` | Входящее отображается на Customer 360/deal timeline; открытие ставит `readAt`, но не закрывает задачу. Ответить можно на последнее входящее. |

**Вывод:** входящая почта существует и является критичным CRM-контуром. Она не может продолжить работу без изменений после отказа от Resend Receiving, потому что envelope, подпись, получение тела и attachment proxy завязаны на Resend API.

### Зависимость CRM и задач

- `CommunicationLog.externalId @unique` — текущий threading/idempotency anchor. Для email используются `EMAIL_INBOUND`/`EMAIL_OUTBOUND`; `subject`, `attachments`, `resendEmailId`, `readAt` — email-specific поля.
- `InboxMessage.messageId @unique` и `resendEmailId @unique` — очередь неизвестных отправителей.
- `lib/crm/auto-task.ts:ensureFollowUpTask` создаёт одну `OPEN FOLLOW_UP` на `(customerUserId, dealId)` со сроком `now + 4h`; owner = owner сделки, иначе первый ADMIN. Повторный ответ обновляет существующую задачу. Ошибка задач не откатывает сохранение письма.
- `/api/admin/replies/count` считает **все** открытые задачи текущего менеджера, не только email; `RepliesBadge` опрашивает раз в 60 секунд.
- `/api/admin/inbox/count` отдельно считает неизвестные `InboxMessage(PENDING)`; `InboxBadge` также опрашивает раз в 60 секунд.
- Входящая копия должна вызывать `ensureFollowUpTask`; исходящая копия из Timeweb «Контроль исходящих» — никогда.

### Настройки и эксплуатация

- `lib/settings.ts` и `app/actions/settings.ts` позволяют DB override для `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_FROM_FALLBACK`, `RESEND_WEBHOOK_SECRET`, `INBOUND_EMAIL` с env fallback и cache 60 секунд.
- `.env.example` содержит только Resend-переменные; IMAP/SMTP зависимостей в `package.json` сейчас нет.
- Отдельного worker/cron контура в репозитории нет.
- Проверочные скрипты: `verify-email-log`, `verify-email-inbound`, `verify-email-resolve`, `verify-resend-receiving-path`, `verify-auto-task`. Они Resend-shaped и должны быть разделены на domain tests и provider tests.

### DNS snapshot на 2026-07-17

Live `dig` уже показывает состояние, отличное от предположения «MX ещё на Resend»:

| Имя | Наблюдение |
|---|---|
| `geleoteka.ru MX` | `10 mx1.timeweb.ru.`, `20 mx2.timeweb.ru.` |
| `geleoteka.ru TXT` | `v=spf1 include:_spf.timeweb.ru ~all` |
| `_dmarc.geleoteka.ru TXT` | `v=DMARC1;p=none` |
| `send.geleoteka.ru MX/TXT` | стандартные Resend sending records не обнаружены |
| `resend._domainkey.geleoteka.ru TXT` | стандартный Resend selector не обнаружен |
| NS | Timeweb (`ns1/ns2.timeweb.ru`, `ns3/ns4.timeweb.org`) |

Это не доказывает состояние private Settings, Resend dashboard или Timeweb forwarding. Перед любым DNS-изменением повторить запросы и проверить обе панели. Возможны три реальных состояния: DNS-переезд уже частично сделан; Timeweb пересылает `info@` в скрытый Resend receiving-domain; либо production inbound сейчас не работает.

> **UPDATE 2026-07-17 (после написания плана):** загадка решена — при переезде хостинга 2026-07-05 Timeweb создал дефолтную зону, Resend-записи не перенесли, inbound был сломан. Записи восстановлены через Timeweb API: DKIM `resend._domainkey`, MX+SPF на `send.`, корневой MX → `inbound-smtp.eu-west-1.amazonaws.com` (Timeweb MX удалены — ящиков не существовало). Домен в Resend verified, webhook enabled. Актуальный snapshot перед Task 0 снимать заново; исходное состояние для миграции теперь «всё на Resend», как и предполагает Вариант B.
>
> **UPDATE 2026-07-18 — Task 0 spike ВЫПОЛНЕН** (тестовый поддомен `mail-spike.geleoteka.ru`, ящики manager/archive/sender, прод не затронут):
>
> - **«Контроль исходящих»: PASS.** Отправка по SMTP от manager@ → копия в архиве побайтно идентична доставленному письму (Message-Id, все заголовки, тело). Схема сбора исходящих через архив работает.
> - **«Пересылка входящих»: FAIL как копия.** Даже с `is_leave_messages=true` (подтверждено дважды, второй тест спустя ~1 ч после настройки) письмо ПЕРЕНОСИТСЯ в архив и исчезает из ящика менеджера. Заголовки при пересылке сохраняются (SES Message-Id нетронут), но менеджер письмо не увидит → архивная схема для ВХОДЯЩИХ непригодна. **Решение: fallback из плана — прямой IMAP-опрос INBOX каждого ящика** (архив остаётся только для исходящих). Открытый вопрос поддержке Timeweb: есть ли режим «копия» у пересылки (в панели vs API).
> - Механика API: почтовый модуль работает с поддоменами только через **v2** (`/api/v2/mail/...`; v1 отдаёт domain_not_found). Создание ящика: POST с `{login,password}`; настройки: PATCH с `forward_settings{is_enabled,forward_list,is_leave_messages}` / `outgoing_settings{is_enabled,outgoing_email}`. Поддомен создавать ДО DNS-записей (сущность конфликтует с существующей зоной), путь `/subdomains/{label}` сам дописывает родителя.
> - IMAP `imap.timeweb.ru:993` / SMTP `smtp.timeweb.ru:465` работают, логин = полный адрес; имена папок английские (`Sent`, `Spam`) — локализация имён Sent из Task 2 не проблема.
> - Спайковые ящики оставлены живыми для разработки Task 2 (креды в scratchpad сессии 2026-07-17; при необходимости пересоздать).

## Target Architecture

```text
Клиент ──SMTP──> Timeweb MX ──> ящик info/manager ──> телефон менеджера
                                        ↑ worker читает INBOX напрямую (BODY.PEEK)
                            (входящая пересылка НЕ используется: спайк 2026-07-18
                             доказал, что она ПЕРЕНОСИТ письмо, а не копирует)

Телефон менеджера ──SMTP Timeweb──> клиент
                    └── «Контроль исходящих» ──> crm-archive@ (IMAP)  [спайк: копия побайтно]

Geleoteka ──Resend API──> клиент
            From: info@geleoteka.ru
            Reply-To: info@geleoteka.ru ──> Timeweb ──> archive copy

mail-sync worker ──IMAPS/UID replay──> provider-neutral ingest
                  ├── known/threaded inbound ──> CommunicationLog + FOLLOW_UP
                  ├── known/threaded outbound ─> CommunicationLog, без задачи
                  └── unresolved ──────────────> InboxMessage(PENDING)
```

### Варианты исходящего транспорта

| Вариант | Плюсы | Минусы | Решение |
|---|---|---|---|
| **A. Полный SMTP Timeweb** | Один почтовый провайдер; единый From; исходящее попадает в Timeweb controls; нет Resend API key | Нужны SMTP credentials в приложении; неизвестны production-лимиты/anti-abuse/reputation; нет webhook delivery events; одновременно меняется inbound и outbound | Реализовать как протестированный ручной fallback, но не включать первым cutover. Рассмотреть через 14 дней и после ответа Timeweb по лимитам. |
| **B. Hybrid: Resend transactional + Timeweb mailboxes** | Минимум изменений в пяти критичных customer flows; Resend остаётся специализированным transport; человеческая почта независима от платформы | Два провайдера и две DKIM-подписи; нужен аккуратный DNS; CRM-ответ из приложения идёт Resend, а с телефона — Timeweb | **Рекомендуется для production cutover.** |
| **C. Оставить Resend и только добавить Timeweb-клиенты** | Мало кода | Root MX не может надёжно раздавать один домен двум providers; CRM всё ещё зависит от webhook и не видит Sent с телефонов | Отклонено. |

### Варианты попадания переписки менеджеров в CRM

| Вариант | Оценка |
|---|---|
| IMAP каждого ящика (`INBOX` + `Sent`) | Технически полный и не зависит от mail-client BCC, но требует хранить credentials всех ящиков, учитывать локализованные имена Sent и дедуплицировать больше источников. **Fallback**, если server-side copies искажают headers. |
| Клиентский auto-BCC | Не работает одинаково в iOS/Android/разных клиентах, пользователь может отключить, входящие не покрывает. **Не использовать как source of truth.** |
| Timeweb server-side входящая пересылка + «Контроль исходящих» в один archive mailbox | Один IMAP credential, покрывает обе стороны и продолжает накапливать почту во время downtime приложения. Timeweb документирует обе функции. **Рекомендуется после ручной проверки сохранения headers/original mailbox.** |
| Resend receiving на root рядом с Timeweb MX | При одинаковом приоритете доставка случайна; при разных приоритетах один provider — основной, второй лишь failover и не получает копию. **Запрещено.** Если Resend Receiving временно нужен, использовать отдельный subdomain/forwarding. |

Официальные опорные документы:

- Timeweb IMAP/SMTP: <https://timeweb.cloud/docs/mail/email-clients-configuration>
- Timeweb MX/SPF/DKIM: <https://timeweb.cloud/docs/mail/setting-up-domain-mail/dns-settings-for-timeweb-cloud>
- Timeweb forwarding и «Контроль исходящих»: <https://timeweb.com/ru/docs/pochta/osnovnye-voprosy-po-rabote-s-pochtoj/sozdanie-i-nastrojka-pochtovogo-yashchika/>
- Timeweb aliases: <https://timeweb.com/ru/docs/pochta/osnovnye-voprosy-po-rabote-s-pochtoj/aliasy-dlya-yashchika/>
- Resend receiving/MX conflict: <https://resend.com/docs/dashboard/receiving/custom-domains>
- Resend sending DNS и DMARC: <https://resend.com/docs/dashboard/domains/introduction>, <https://resend.com/docs/dashboard/domains/dmarc>

## DNS Plan

### MX

- Source of truth для root-domain — только Timeweb: `10 mx1.timeweb.ru.`, `20 mx2.timeweb.ru.`. На snapshot они уже стоят; если повторный preflight совпадёт, Task 6 не меняет MX вообще.
- Не добавлять Resend receiving MX на `geleoteka.ru` ни с тем же, ни с более высоким/низким priority. MX не делает fan-out.
- Если legacy Resend Receiving нужен на soak period, выделить subdomain (`inbound.geleoteka.ru`) с собственным MX и пересылать туда серверную копию. Не менять адреса менеджеров и root MX.
- Перед любым реальным cutover сохранить export DNS zone и прежний полный набор MX; снизить TTL до 300 секунд минимум за 24 часа, если текущий TTL больше.

### SPF

- На одном DNS owner может быть только **одна** SPF TXT-запись. Нельзя публиковать отдельные `v=spf1` для Timeweb и Resend на одном имени.
- Текущий root SPF `include:_spf.timeweb.ru ~all` оставить для Timeweb SMTP.
- Resend обычно выдаёт Return-Path records на `send.geleoteka.ru` (отдельные MX + SPF TXT), поэтому они не конфликтуют с root MX/SPF. Добавлять **ровно значения из актуального Resend dashboard**, не копировать пример из этого плана.
- Если dashboard неожиданно требует SPF именно на root, собрать один root SPF с обоими mechanisms и проверить лимит 10 DNS-lookups. Не создавать второй root TXT `v=spf1`.

### DKIM

- Создать/проверить Timeweb SPF/DKIM после создания первого ящика; при Timeweb NS записи могут появиться автоматически, но значения всё равно зафиксировать в runbook.
- Добавить Resend DKIM selector из dashboard. DKIM selectors Timeweb и Resend должны сосуществовать; удаление одного ломает только соответствующий transport.
- Cutover gate: письмо через Timeweb и письмо через Resend отдельно дают `dkim=pass` и DMARC-aligned `header.from=geleoteka.ru`.

### DMARC

- Текущий `p=none` сохранить на миграцию и добавить отчёты на реально читаемый служебный адрес (`rua=mailto:dmarc@geleoteka.ru`) только после создания mailbox/alias.
- 7–14 дней собирать отчёты и убедиться, что легитимные Timeweb и Resend потоки проходят alignment.
- Затем отдельным change с owner approval перевести `p=none → quarantine` и только после ещё одного периода наблюдения — в `reject`. Не ужесточать DMARC в день смены transport/MX.
- Проверить `adkim`/`aspf` и `sp` для subdomains; не включать strict alignment без отчётов по обоим providers.

## Context for Implementer

- Доменный ingestion не должен принимать `ResendInboundEnvelope`. Ввести provider-neutral `ParsedEmail`; Resend webhook и Timeweb IMAP лишь преобразуют свои данные в него.
- RFC `Message-Id` — первичный cross-provider dedupe/threading key. При отсутствующем/невалидном id генерировать стабильный synthetic id из `provider + mailbox + folder + UIDVALIDITY + UID`, а не случайный UUID.
- Для threading проверять `In-Reply-To`, затем `References` от последнего к первому; существующий код проверяет только первый заголовок.
- Направление определяется по нормализованному `From`: адрес из явного реестра `MailIdentity` означает outbound; внешний sender — inbound. Нельзя определять направление по тому, что письмо физически лежит в archive `INBOX`.
- Inbound resolution: thread → sender primary/alias → unknown inbox. Outbound resolution: thread → единственный известный recipient → unresolved inbox. Multi-customer recipient не угадывать.
- Только known inbound вызывает `ensureFollowUpTask`; duplicate, outbound и unresolved — нет.
- `createdAt/occurredAt` брать из валидного `Date` header/IMAP internal date, а не из времени синка, иначе downtime исказит CRM timeline и SLA.
- Cursor двигается только после durable записи результата `PROCESSED`, `DUPLICATE` или `DEAD`; poison message после ограниченных retries попадает в dead-letter и остаётся доступен для ручного replay.
- UIDVALIDITY change не должен сбрасывать cursor и повторно создавать всю историю: начать безопасный rescan нового validity, дедуплицируя по RFC Message-Id.
- Worker должен иметь DB lease, чтобы несколько App Platform replicas не импортировали один UID параллельно.
- Не запускать бесконтрольный `setInterval` внутри Next web process. Рекомендуется отдельный worker command/service; fallback — защищённый internal sync endpoint, вызываемый внешним scheduler. Перед реализацией route/runtime перечитать релевантную Next.js 16 документацию из `node_modules/next/dist/docs/`.
- Timeweb IMAP credential хранить только в secret env Timeweb Cloud Apps, не в client bundle и не в текущей plaintext `Setting` table. Non-secret host/port/folder можно держать в settings.
- IMAP: `imap.timeweb.ru:993` TLS; SMTP: `smtp.timeweb.ru:465` TLS или `587` STARTTLS, auth username = полный email. Сертификаты проверять, plaintext ports 25/143 не использовать.
- Archive mailbox — immutable operational source: менеджерам не выдавать пароль и не разрешать удаление. Quota/retention мониторить.
- Legacy `resendEmailId` и attachment proxy не удалять, пока старые письма остаются в UI. Новые Timeweb attachment locators должны быть provider-neutral и авторизоваться через parent email row.
- Существующий HTML уже рендерится в `iframe sandbox=""`; сохранить sandbox и не вставлять remote HTML напрямую в DOM.

## Runtime Environment

- App: Next.js 16.2.3, Node runtime, Timeweb Cloud Apps, PostgreSQL/Prisma 6.
- Timeweb documented endpoints: `imap.timeweb.ru:993`, `smtp.timeweb.ru:465/587`, webmail `mail.timeweb.com`.
- Suggested packages: `imapflow` for IMAP and `mailparser` for MIME; `nodemailer` for the optional SMTP adapter. Зафиксировать актуальные compatible versions в lockfile и проверить server-only bundle.
- New worker command: `npm run mail:sync-worker`; same codebase and DB as web app.
- **ASSUMPTION:** Timeweb Cloud Apps позволяет запустить отдельный long-running worker/второй service из того же repo. Вопрос: какой поддерживаемый deployment primitive и health/restart policy использовать? Если такого primitive нет, утвердить внешний scheduler для `POST /api/internal/mail-sync` до Task 2.

## Assumptions and Manual Gates

Каждый пункт ниже — `ASSUMPTION`, потому что его нельзя подтвердить кодом проекта; блокирующий вопрос должен получить ответ до указанного task/cutover.

| ASSUMPTION | Вопрос для ручной проверки | Gate |
|---|---|---|
| Тариф Timeweb предоставляет нужное число ящиков и достаточную quota | Это «Корпоративная почта» (документировано до 100 ГБ/ящик) или legacy «Почта» (может быть 5 ГБ на опцию)? Каковы реальные quota, max message и rate limits аккаунта Geleoteka? | До создания archive |
| `info@` и текущие managers уже существуют/доступны | Какие ящики, aliases, forwarding, catch-all и passwords реально настроены? Есть ли старые письма, которые надо импортировать? | Task 0 |
| «Рассылки» делает копию, а не перенос | Остаётся ли исходное письмо в manager/info mailbox после пересылки в archive? | До включения production copies |
| Forwarding сохраняет headers | Сохраняются ли `Message-Id`, `In-Reply-To`, `References`, `From`, `To`, `Cc`, `Date` и MIME attachments byte-for-byte или появляются wrapper/message/rfc822? | Task 0 spike |
| «Контроль исходящих» покрывает все клиенты | Попадает ли копия в archive при отправке через iOS Mail, Android/Gmail client, Outlook, Timeweb webmail и SMTP приложения? Сохраняется ли оригинальный Message-Id? | Task 0 spike |
| IMAP service account стабилен | Доступен ли `crm-archive@` по IMAPS 993 без IP allowlist/CAPTCHA/2FA; есть ли app password; как называется Sent/Archive и поддерживается ли UIDPLUS/IDLE? | Task 2 |
| App Platform разрешает egress | Разрешены ли исходящие TCP 993, 465 и 587 из production container? | Task 0 connectivity test |
| Background execution поддержан | Можно ли развернуть отдельный worker или cron у текущего App Platform plan? | До выбора runner |
| Текущий Resend production настроен | Какой sending domain verified, какие DNS records и webhook forwarding реально активны? Почему public DNS не показывает стандартные records? | Task 0 |
| Legacy attachments ещё доступны | За какой период Resend API реально отдаёт вложения и нужно ли snapshot-ить критичные файлы до отключения Receiving? | Task 1 |
| Archive retention приемлем | Кто отвечает за quota, backup и запрет удаления; сколько лет хранить письма? | До go-live |

## Progress Tracking

Стории 1–5 — код, выполняются автономно (`ultraralph --auto`). Task 0 закрыт спайком 2026-07-18. Task 6–7 — операционные (прод-катовер, MX, soak), **не входят в автономный прогон**, остаются за пользователем.

- [x] Task 0: Production preflight — панели, DNS, mailbox matrix, header-preservation spike   (Status: VERIFIED — см. UPDATE 2026-07-18)
- [x] Story 1 (Task 1): Provider-neutral email model и additive Prisma migration   (Status: VERIFIED — все ворота зелёные; инлайн high-risk verify PASS 2026-07-20)
- [x] Story 2 (Task 2): Timeweb IMAP adapter, replay-safe sync и worker runner   (Status: VERIFIED — 46 тестов, verify-timeweb-imap PASS, все ворота зелёные; инлайн high-risk verify PASS 2026-07-20. Known-minor: poison-письмо после UIDVALIDITY-change может получить 2-ю DEAD-строку — без влияния на CRM.)
- [x] Story 3 (Task 3): CRM resolution входящих/исходящих + задачи   (Status: VERIFIED — 58 тестов + 4 verify PASS, все ворота зелёные; инлайн high-risk verify PASS 2026-07-20: outbound привязывается только при РОВНО одном известном получателе, иначе park — cross-customer-leak закрыт. Шов Story 1 (кейс 6) закрыт.)
- [x] Story 4 (Task 4): Provider-neutral attachments, inbox/timeline UI и diagnostics   (Status: VERIFIED — 177 тестов, все ворота зелёные; инлайн high-risk verify PASS 2026-07-20: attachment-роут — auth-first, локатор из БД, allow-list attachmentId, санитизация filename (traversal+header injection), 410/502, nosniff; replay ADMIN-only идемпотентен.)
- [x] Story 5 (Task 5): Outbound transport abstraction — generic SMTP primary, Resend как удаляемый legacy-адаптер (RESCOPED 2026-07-28)   (Status: VERIFIED — 189 тестов, все ворота зелёные; инлайн high-risk verify PASS 2026-07-20: selectTransport без failover (нет двойной отправки), ACCEPTED≠DELIVERED, timeout→UNKNOWN/N_A (не переслеп), SMTP-пароль только env, API 5 call sites неизменен. ⚠️ дефолт EMAIL_TRANSPORT=smtp — см. операционную заметку ниже.)
- [ ] Task 6 (ВНЕ автопрогона): Timeweb mailbox/DNS cutover без потери писем
- [ ] Task 7 (ВНЕ автопрогона): Soak, outage drill, rollback readiness и legacy cleanup decision

## Implementation Tasks

### Task 0: Production preflight и header-preservation spike

**Objective:** Зафиксировать реальное production-состояние и доказать, что рекомендуемый single-archive поток не теряет письмо и threading headers, до написания IMAP ingestion вокруг неподтверждённого поведения.

**Files:**

- Create: `docs/runbooks/mail-timeweb.md`
- Create: `scripts/verify-mail-dns.ts` (только диагностика; не меняет DNS)
- Modify: `.env.example` (пока только имена будущих переменных, без secrets)

**Operational work:**

1. Export DNS zone, Resend domain/webhook config, Timeweb mailbox/alias/forwarding config; сохранить секреты только в secret manager, не в документ.
2. Повторить `dig` для root MX/TXT, `_dmarc`, всех Resend selectors/return-path из dashboard.
3. Снять DB counts: `CommunicationLog` email inbound/outbound по дням, `InboxMessage` по status, `InboundAttempt` outcomes, открытые `FOLLOW_UP`.
4. Создать временные `mail-spike-sender@` и `mail-spike-archive@`; включить входящую пересылку и «Контроль исходящих».
5. Прогнать сообщения Gmail/Yandex/Mail.ru → Timeweb и обратно через iOS/Android/webmail; скачать raw `.eml` обоих экземпляров и diff-нуть критичные headers/MIME.
6. Проверить, что оригинал остаётся в человеческом ящике. Если нет или headers ломаются — зафиксировать решение «direct IMAP each mailbox» до Task 2.
7. Проверить TCP TLS из production-like container: 993, 465, 587.
8. Получить ответ Timeweb по тарифу, лимитам SMTP/IMAP, worker/cron и backup/retention.

**Definition of Done:**

- [ ] Runbook содержит фактические mailbox/DNS maps, owner каждого ящика и дату snapshot.
- [ ] Выбран ingestion topology: `archive-copy` или `direct-multi-mailbox`, с приложенными raw-header результатами.
- [ ] Известен поддерживаемый runner и подтверждён egress 993; без этого Task 2 не начинается.
- [ ] Resend dashboard reconciled с public DNS; понятно, работает ли текущий inbound и через какой адрес.
- [ ] Назначены RPO/RTO: target RPO для CRM после восстановления ≤ 5 минут после worker catch-up; человеческая почта не зависит от RTO приложения.

### Task 1: Provider-neutral email model и additive migration

**Objective:** Отделить CRM-domain email от Resend envelope, сохранить legacy rows и дать IMAP-синху durable cursor/dead-letter/idempotency.

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_provider_neutral_email_sync/migration.sql`
- Create: `lib/email/types.ts`
- Create: `lib/email/ingest.ts`
- Modify: `lib/email/resolve.ts` (принимать `ParsedEmail`, не Resend types)
- Modify: `lib/email/inbound.ts` (оставить Resend adapter и mapper)
- Modify: `app/api/email/inbound/route.ts` (legacy webhook вызывает общий ingest)
- Modify: `scripts/verify-email-inbound.ts`, `scripts/verify-email-resolve.ts`
- Create: `scripts/verify-email-ingest.ts`

**Schema contract:**

- `EmailMessage`: provider, direction, normalized from/to/cc/bcc, subject, text/html, RFC Message-Id, In-Reply-To, References, occurredAt, source mailbox/folder/UIDVALIDITY/UID, provider locator/attachment metadata, ingest status/attempt/error.
- Unique source key `(provider, sourceMailbox, sourceFolder, uidValidity, uid)` плюс unique normalized/synthetic RFC Message-Id для cross-provider dedupe.
- `MailboxSyncCursor`: mailbox/folder, UIDVALIDITY, last finalized UID, lastSuccessAt/lastError, leaseOwner/leaseUntil.
- `MailIdentity`: явный internal address → optional manager `User`; тип `MANAGER | SHARED | TRANSACTIONAL | ARCHIVE`. Не выводить credentials.
- Add nullable `emailMessageId` relation из `CommunicationLog` и `InboxMessage`; старые rows остаются валидными.
- Сделать `InboxMessage.resendEmailId` nullable: поле остаётся заполненным и unique для legacy Resend rows, но Timeweb IMAP message не имеет Resend UUID. Все старые select/UI paths должны принять `null`.
- Add `direction`/provider-neutral source fields where нужны для unresolved inbox UI; `resendEmailId` и старый `attachments Json` не удалять.
- Add `ACCEPTED` outcome или отдельный delivery state; Resend HTTP 200/SMTP 250 больше не маркировать как final `DELIVERED`.

**Key Decisions / Notes:**

- Additive migration first; никаких обязательных backfill locks на большой таблице.
- Legacy Resend webhook продолжает работать и создаёт тот же provider-neutral `EmailMessage`, поэтому dual-ingest дедуплицируется по Message-Id.
- DB-транзакция атомарно создаёт `EmailMessage` и соответствующий CRM/Inbox row; сетевой IMAP fetch выполняется до транзакции. `FOLLOW_UP` остаётся best-effort/idempotent шагом после сохранения письма, как сейчас, чтобы сбой task subsystem не откатывал почту.
- Для missing Message-Id synthetic id детерминирован source tuple; повторный fetch не создаёт дубль.
- `EmailMessage` хранит достаточно headers/body для CRM даже после удаления provider content. Вложения остаются по provider locator до Task 4.

**Definition of Done:**

- [ ] Старые страницы/Resend webhook работают на additive schema без backfill.
- [ ] Один и тот же `.eml`, поданный через Resend mapper и IMAP mapper, создаёт один лог/инбокс.
- [ ] Tests покрывают missing Message-Id, malformed headers, References fallback, duplicate race и legacy row без `emailMessageId`.
- [ ] Verify: `npm run verify-email-ingest && npm run verify-email-resolve && npm run verify-email-inbound && npx prisma validate`.

### Task 2: Timeweb IMAP adapter, replay-safe sync и worker

**Objective:** Читать archive mailbox (или выбранные mailbox folders) через IMAPS, безопасно переживать restart/multiple replicas/UIDVALIDITY changes и воспроизводить backlog после downtime.

**Files:**

- Modify: `package.json`, `package-lock.json` (`imapflow`, `mailparser`; worker script)
- Create: `lib/email/providers/timeweb-imap.ts`
- Create: `lib/email/sync.ts`
- Create: `scripts/mail-sync-worker.ts`
- Create: `scripts/verify-timeweb-imap.ts`
- Create: `tests/email/imap-mapper.test.ts`
- Modify: `lib/settings.ts` (только non-secret IMAP settings/feature flags)
- Modify: `.env.example` (`TIMEWEB_IMAP_USER`, secret `TIMEWEB_IMAP_PASSWORD`, host/port/TLS, source folders, `MAIL_SYNC_ENABLED`)
- Conditional fallback only: Create `app/api/internal/mail-sync/route.ts` protected by constant-time Bearer `MAIL_SYNC_CRON_SECRET`, если отдельный worker недоступен.

**Key Decisions / Notes:**

- **Topology (решено спайком 2026-07-18, заменяет исходное «primary = archive»):** гибрид источников. **Входящие** — прямой опрос `INBOX` каждого человеческого ящика (`info@`, ящики менеджеров) строго `BODY.PEEK`, письмо остаётся у менеджера непрочитанным; входящая пересылка Timeweb НЕ используется (она переносит письмо, а не копирует). **Исходящие** — `crm-archive@/INBOX`, куда «Контроль исходящих» кладёт побайтную копию (проверено). Список источников конфигурируемый: `[{mailbox, folder, role: INBOUND|OUTBOUND_ARCHIVE}]`, свой курсор на каждый источник; имена папок не хардкодить (на Timeweb они английские: `INBOX`, `Sent`).
- Worker берёт DB lease, открывает read-only mailbox lock, читает UIDs строго по возрастанию небольшими batches и использует `BODY.PEEK`; не ставит `\Seen` и не удаляет/перемещает mail.
- На каждый UID: fetch raw/source → parse → общий ingest transaction → finalize status/cursor. Ошибка получает bounded exponential retry; после порога `DEAD` с сохранённым locator и кнопкой/скриптом replay.
- Cursor не перепрыгивает необработанный UID без durable `DEAD`; admin diagnostics явно показывает gap/dead-letter.
- Worker health: last success, lag (`highest UID - last UID`), last error и lease owner. Alert, если lag > 5 минут или auth/TLS error.
- При shutdown закрыть IMAP connection и lease; при process crash lease истекает.
- Internal route, если используется, не принимает mailbox/UID от caller; он запускает один bounded batch и не возвращает secrets/errors целиком.

**Definition of Done:**

- [ ] Restart между fetch и commit не создаёт дубль и не теряет UID.
- [ ] Два worker instance одновременно обрабатывают каждый source UID максимум один раз на уровне результата.
- [ ] UIDVALIDITY-change test выполняет rescan без duplicate CRM rows.
- [ ] Poison message после retries виден как `DEAD`, cursor продолжает работу, ручной replay доступен.
- [ ] Outage drill: worker выключен, отправлено 10 писем, worker включён — все 10 импортированы в исходном порядке.
- [ ] Verify: `npx vitest run tests/email/imap-mapper.test.ts && npm run verify-timeweb-imap`.

### Task 3: CRM resolution обеих сторон и задачи

**Objective:** Импортировать не только ответы клиентов, но и письма менеджеров с телефона, сохранив текущую привязку к customer/deal и не создавая ложные FOLLOW_UP.

**Files:**

- Modify: `lib/email/resolve.ts`
- Modify: `lib/crm/auto-task.ts` (интерфейс оставить, добавить только ingest event/idempotency context при необходимости)
- Modify: `app/actions/crm/inbox.ts` (link unresolved inbound/outbound; сохранять canonical email relation)
- Modify: `app/actions/crm/communications.ts` (provider-neutral read state без Resend assumptions)
- Modify: `scripts/verify-email-resolve.ts`, `scripts/verify-auto-task.ts`
- Create: `tests/email/mail-resolution.test.ts`

**Resolution contract:**

- Normalize/validate all addresses once; compare case-insensitively.
- Direction from `MailIdentity`, not archive recipient.
- Thread match: exact `In-Reply-To`, затем `References` newest-first против `CommunicationLog.externalId`/`EmailMessage.rfcMessageId`.
- Known inbound sender: primary `User.email`, затем `CustomerContact EMAIL`; attach most-recent open deal as today.
- Known outbound recipient: ровно один customer primary/alias; attach latest open deal. Если несколько клиентов/нет match — `InboxMessage(PENDING, direction=OUTBOUND)` для ручной привязки.
- When linked, unknown sender alias добавляется только для inbound; outbound recipient не создаёт alias автоматически.
- Auto-task только после new known inbound. Duplicate replay, manager outbound, spam/archive и ручной повтор link не создают/не bump-ят задачу второй раз.
- Task dueAt рассчитывать от времени фактического письма или момента ingestion? **Decision:** от момента ingestion, чтобы после долгого downtime задача сразу была overdue, но не имела dueAt в прошлом на недели; в body показать фактическую дату письма. Зафиксировать тестом.
- Author manager для outbound берётся из `MailIdentity.userId`; shared `info@` без однозначного автора остаётся `authorUserId=null`.

**Definition of Done:**

- [ ] Входящий reply к транзакционному Resend Message-Id попадает в тот же customer/deal после прохождения через Timeweb archive.
- [ ] Новое письмо менеджера с телефона появляется как `EMAIL_OUTBOUND` с author и не создаёт задачу.
- [ ] Ответ клиента на это письмо появляется как `EMAIL_INBOUND` и создаёт/обновляет одну FOLLOW_UP.
- [ ] Unknown inbound/outbound видны в inbox и могут быть вручную привязаны без race/duplicate.
- [ ] Verify: `npx vitest run tests/email/mail-resolution.test.ts && npm run verify-email-resolve && npm run verify-auto-task`.

### Task 4: Provider-neutral attachments, inbox/timeline UI и diagnostics

**Objective:** Убрать обязательность `resendEmailId` из нового UI/attachment path и дать оператору видимость sync lag/dead-letter, сохранив доступ к legacy Resend attachments.

**Files:**

- Modify: `app/api/admin/inbox/attachments/[id]/route.ts` или Create: `app/api/admin/email-messages/[messageId]/attachments/[attachmentId]/route.ts`
- Modify: `components/crm/CommunicationLogger.tsx`
- Modify: `app/(admin)/admin/crm/inbox/page.tsx`
- Modify: `app/(admin)/admin/crm/inbox/[id]/page.tsx`
- Modify: `components/admin/inbox/InboxActions.tsx`
- Modify: `app/(admin)/admin/settings/inbound-log/page.tsx`
- Create: `app/(admin)/admin/settings/mail-sync/page.tsx`
- Create: `app/actions/mail-sync.ts` (ADMIN-only retry/replay)
- Modify: customer/deal pages that select `resendEmailId`/attachments

**Key Decisions / Notes:**

- New attachment URL uses internal `EmailMessage.id` + attachment id, never raw mailbox password/provider UID supplied by the browser.
- Server verifies ADMIN/MANAGER, parent ownership and provider locator. IMAP fetch uses `BODY.PEEK` for exact part and returns `Content-Disposition: attachment`; no inline execution.
- Archive mailbox is retention source. Optional later storage-to-S3 is outside this migration; пока показывать явный `410` с причиной, если provider object/mailbox message исчез.
- Legacy rows с `resendEmailId` продолжают идти через старый Resend proxy; UI выбирает route по source provider.
- Inbox list/detail показывает direction, original From/To, mailbox source и «синхронизировано позже» при backlog.
- Diagnostics: last poll, last successful UID, lag, dead count, auth/TLS error redacted, manual replay by EmailMessage/UID. Secrets никогда не показывать.

**Definition of Done:**

- [ ] Timeweb attachment скачивается из timeline и unresolved inbox; legacy Resend attachment продолжает работать.
- [ ] HTML остаётся sandboxed; опасный filename/header не приводит к header injection/path traversal.
- [ ] Admin видит sync healthy/lag/dead без доступа к container logs.
- [ ] Replay одного DEAD не создаёт второй CommunicationLog/InboxMessage/task.
- [ ] Verify: auth tests для attachment/replay routes + `npm run build`.

### Task 5: Outbound abstraction — provider-agnostic SMTP primary, Resend как удаляемый legacy-адаптер

> **RESCOPED 2026-07-28 (разворот стратегии, см. память `platform-vision-multi-tenant`):** Resend **убираем**. Он усложняет CRM и не ложится на мультитенантную платформу (Гелеотека — первый боевой клиент; каждый автосервис приносит свой почтовый хостинг). Отправка идёт через **generic SMTP (nodemailer), host/port/креды конфигурируемы на идентичность/тенант — не только Timeweb**. Resend демотируется до опционального адаптера, который можно выключить и удалить; дефолт транспорта — `smtp`. Физический демонтаж Resend (снятие inbound webhook-адаптера, смена MX) — операционный шаг Task 6–7 (за пользователем): сейчас Resend Receiving — единственный рабочий inbound в проде, вырывать его из кода до готовности IMAP-ящиков нельзя.

**Objective:** Отделить transport за общим интерфейсом; сделать **generic SMTP** основным провайдер-независимым транспортом; Resend оставить опциональным legacy-адаптером за тем же интерфейсом (для безопасного переходного периода), но НЕ основным. Сохранить существующие call sites без изменений API.

**Files:**

- Modify: `package.json`, `package-lock.json` (`nodemailer` + types при необходимости)
- Create: `lib/email/transport.ts`
- Create: `lib/email/providers/resend.ts` (legacy, опциональный)
- Create: `lib/email/providers/smtp.ts` (generic SMTP — host/port/креды из конфига, НЕ хардкод Timeweb; заменяет прежний `timeweb-smtp.ts`)
- Modify: `lib/email/send.ts` (backward-compatible facade `sendEmail`)
- Modify: `lib/email/log.ts` (`ACCEPTED` semantics; provider id/status)
- Modify: `lib/email/helpers.ts` only if result type changes
- Modify: `lib/settings.ts`, `app/actions/settings.ts`
- Modify: `components/admin/settings/TestSendButton.tsx`
- Modify: `.env.example`
- Verify unchanged API at: `app/actions/booking.ts`, `register.ts`, `part-orders.ts`, `rentals.ts`, `crm/estimates.ts`, `crm/inbox.ts`
- Modify: `scripts/verify-email-log.ts`; Create: `tests/email/transports.test.ts`

**Key Decisions / Notes:**

- `EMAIL_TRANSPORT=smtp|resend`; **дефолт — `smtp`** (generic). Resend доступен только если явно выбран и настроен — переходная опция, подлежит удалению после катовера. Без automatic failover (риск двойной отправки).
- SMTP-конфиг провайдер-независимый: `SMTP_HOST/SMTP_PORT/SMTP_SECURE` + креды на отправляющую идентичность. Для Гелеотеки — Timeweb (`smtp.timeweb.ru:465`), но значения из конфига, чтобы другой тенант/автосервис подключил свой сервер без правки кода.
- `EMAIL_REPLY_TO=info@geleoteka.ru` вместо hardcode (тоже конфиг на тенант).
- SMTP credential — отдельный service mailbox/password в secret env, не manager password. From должен быть разрешён почтовым сервером; spoofing чужого mailbox не предполагать.
- Оба adapters принимают одинаковые `messageId/inReplyTo/references`, timeout и structured result `{ accepted, providerMessageId?, error? }`.
- Resend HTTP 200 и SMTP 250 → `ACCEPTED`, не final delivery. `FAILED` только на определённом rejection; timeout после write помечать `UNKNOWN`, не запускать автоматическую повторную отправку другим provider.
- Test-send UI показывает выбранный transport и source config; больше не пишет «Resend» при SMTP.
- Никакого SMTP connection reuse в serverless web request без bounded pool/lifecycle; worker и web transport конфигурируются отдельно.

**Definition of Done:**

- [ ] Все пять шаблонов и CRM reply проходят contract tests через fake Resend и fake SMTP adapters.
- [ ] Production-like test через Resend и Timeweb SMTP отдельно даёт корректный Message-Id/thread headers и SPF/DKIM/DMARC pass.
- [ ] Переключение transport требует одного config change/redeploy; automatic failover отсутствует.
- [ ] Existing transactional action success не зависит от временной почтовой ошибки, кроме синхронного `sendEstimate`, где UI уже показывает ошибку по текущему контракту.
- [ ] Verify: `npx vitest run tests/email/transports.test.ts && npm run verify-email-log && npm run build`.

### Task 6: Provisioning, DNS и production cutover

**Objective:** Включить человеческие ящики и CRM ingestion без окна потери писем и без одновременных root MX providers.

**Files:**

- Modify: `docs/runbooks/mail-timeweb.md` (exact values, timestamps, operator/sign-off)
- No application code unless preflight chose internal cron route.

**Order:**

1. Создать/проверить `info@`, отдельные manager mailboxes, `crm-archive@`, `dmarc@` mailbox/alias. Aliases вроде `sales@` привязать к явно выбранному ящику; alias не заменяет manager mailbox, потому что у него нет собственного login/password.
2. Настроить manager phones: IMAP 993 TLS, SMTP 465 TLS или 587 STARTTLS; запретить POP3.
3. Включить server-side incoming copy и outgoing control по одному mailbox; после каждого прогнать smoke и убедиться, что original mailbox продолжает получать письмо.
4. Запустить IMAP worker в `shadow`: он парсит/показывает lag и duplicates, но не пишет CRM. Зафиксировать baseline UID перед включением live ingest.
5. Деплоить additive schema + common ingest; оставить Resend webhook включённым. Включить live IMAP ingest. Дубли из dual path должны схлопываться по Message-Id.
6. Проверить/добавить Timeweb SPF/DKIM и Resend sending-only records. На текущем snapshot root MX уже Timeweb — не выполнять бессмысленную смену.
7. Если root MX фактически другой на день cutover: сначала убедиться, что все ящики готовы, затем заменить MX на `mx1/mx2.timeweb.ru`; старые MX не смешивать. Мониторить оба providers 24 часа из-за DNS cache.
8. Отправить все E2E scenarios. Только после PASS выдать manager passwords/app configuration.
9. Оставить Resend Receiving webhook/subdomain, API key и legacy attachment path минимум на 14 дней. Затем отключить receiving capability, но не outbound key.
10. Поднять DMARC только отдельным change после анализа отчётов.

**Definition of Done:**

- [ ] Каждый manager читает/отправляет с телефона при остановленном приложении.
- [ ] Root MX содержит только Timeweb; sending records обоих transports проходят auth.
- [ ] 24 часа нет missing/duplicate CRM messages, worker lag в пределах target.
- [ ] Resend transactional sends продолжаются, replies приходят в Timeweb и затем CRM.
- [ ] Exact rollback commands/owners записаны до cutover, а не после инцидента.

### Task 7: Soak, outage drill и cleanup decision

**Objective:** Доказать отказоустойчивость в реальном режиме и только потом решить, выключать ли Resend Receiving или переводить transactional на SMTP.

**Files:**

- Modify: `docs/runbooks/mail-timeweb.md`
- Modify: `docs/plans/2026-07-17-mail-timeweb-migration.md` — заполнить Verification Evidence/решение
- Cleanup later only: Resend-specific code/schema/tests after separate approval

**Soak metrics (7–14 дней):**

- Количество Timeweb archive messages vs `EmailMessage(PROCESSED/DUPLICATE/DEAD)` по суткам.
- Max/median sync lag, reconnect count, auth failures, UIDVALIDITY changes.
- Unknown inbox rate, duplicate rate, threading match rate, auto-task count.
- Resend transactional accepted/failed/unknown и DMARC aggregate pass rate.
- Archive quota growth и attachment retrieval success.

**Drills:**

1. Остановить web + worker на 30 минут; провести двухстороннюю переписку с вложением через телефон; восстановить; убедиться в полном catch-up и одной задаче.
2. Остановить только worker; web/Resend sends продолжаются; после запуска replies импортируются.
3. Дать IMAP auth failure; alert/diagnostics видят ошибку, manager mail не страдает; после rotation cursor продолжает с прежнего UID.
4. Повторно подать последние 20 UIDs и один legacy Resend event — ни дублей, ни новых задач.

**Decision after soak:**

- Default: оставить hybrid, если deliverability/стоимость/операции приемлемы.
- Перейти на Timeweb SMTP только после подтверждённых лимитов, отдельной недели canary и сравнения доставляемости Gmail/Yandex/Mail.ru. Сначала 10%, затем 100%; manual config switch.
- Удалять Resend Receiving adapter/fields только после export legacy data и подтверждения, что все нужные attachments либо сохранены, либо retention истёк с owner sign-off.

**Definition of Done:**

- [ ] Outage drill PASS: человеческая почта без перерыва, CRM полностью догнала backlog.
- [ ] Нет необъяснённых gaps между archive и DB.
- [ ] DMARC reports показывают оба легитимных транспорта.
- [ ] Зафиксировано решение: `hybrid stays` или отдельный approved SMTP cutover.

## Migration Sequence Without Mail Loss

1. **Observe before mutate:** export DNS/panels/DB counts; определить, почему MX уже Timeweb и как текущий inbound достигает Resend.
2. **Provision first:** ящики и archive создаются до DNS/config changes; manager login проверяется в webmail и на телефоне.
3. **Prove copies:** ручной raw-header spike; при провале перейти к multi-mailbox IMAP.
4. **Deploy additive:** schema/common ingest/worker выкатываются при работающем legacy webhook.
5. **Shadow/reconcile:** archive UIDs и Resend events сравниваются без CRM writes.
6. **Dual ingest:** общий dedupe включён, затем IMAP writes; legacy webhook остаётся.
7. **MX cutover only if needed:** root направлен только в Timeweb. DNS cache наблюдается минимум 24 часа.
8. **Soak:** не удалять forwarding, Resend keys, webhook code, old DNS records unrelated to root receiving или legacy attachment route 14 дней.
9. **Tighten later:** DMARC policy и SMTP provider change — отдельные, не совмещённые changes.

## Rollback Plan

### CRM sync problem, почта Timeweb работает

- `MAIL_SYNC_ENABLED=false`; не трогать MX/ящики/телефоны.
- Archive продолжает накапливать сообщения. Исправить parser/resolver, затем replay с последнего verified UID.
- Если ошибочные rows уже созданы, не удалять массово: идентифицировать по `EmailMessage.source tuple`, исправить idempotent repair script и повторно проверить task counts.

### Ошибка Timeweb incoming/outgoing copy

- Отключить forwarding/control только на проблемном mailbox.
- Переключить config на direct IMAP `INBOX`/`Sent` этого mailbox; cursor отдельный.
- Клиентский BCC можно использовать лишь как временную ручную меру, не как восстановленный steady state.

### Resend transactional outage

- Не делать автоматический retry через SMTP после timeout.
- Для подтверждённого hard outage вручную поставить `EMAIL_TRANSPORT=timeweb-smtp` после test-send и operator sign-off; зафиксировать cutoff timestamp и provider IDs, чтобы не переслать уже принятые сообщения.
- Вернуть `resend` после восстановления тем же контролируемым способом.

### Timeweb mailbox/MX incident

- Менеджеры используют Timeweb webmail/clients, пока доступен сам mail cluster; падение приложения не повод менять MX.
- Если отказал сам Timeweb mail cluster, rollback возможен только на **предыдущий полноценный mailbox provider**, зафиксированный в Task 0. Resend Receiving не является полноценным human-mailbox rollback target.
- Возвращать старые MX только по сохранённому zone export и после проверки, что старый provider всё ещё держит ящики. Не публиковать одновременно Timeweb и Resend root MX «для надёжности».

### DNS authentication regression

- Откатить только изменённую SPF/DKIM/DMARC record по zone export; MX не трогать, если приём работает.
- Вернуть DMARC в `p=none`, но не удалять отчёты; восстановить последний passing DKIM selector.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Реальное состояние уже частично Timeweb и не совпадает с описанием | High | High | Task 0 reconciliation; no blind MX change. |
| Timeweb forwarding переписывает Message-Id/thread headers | Medium | High | Raw `.eml` spike; direct per-mailbox IMAP fallback. |
| Outgoing control не покрывает один из мобильных clients | Medium | High | Test matrix iOS/Android/webmail/SMTP; при gap синк Sent напрямую. |
| Два root MX providers дают случайную доставку | High при неверной настройке | Critical | Timeweb-only root MX; Resend receiving only subdomain/forwarding. |
| Две SPF записи ломают SPF PermError | Medium | High | Один SPF per owner; exact dashboard records; automated DNS check. |
| Worker restart/scale создаёт gaps или duplicates | Medium | High | UID cursor + UIDVALIDITY + DB lease + unique keys + replay tests. |
| Poison MIME блокирует весь cursor | Medium | High | Bounded retry, durable DEAD, alert, manual replay; cursor finalized explicitly. |
| Forwarded copy приходит и через Resend webhook, и IMAP | High during cutover | Medium | Cross-provider Message-Id dedupe in one transaction. |
| Archive password утечёт из plaintext Setting | Medium | Critical | Password only in Timeweb secret env; rotate; no UI/readback. |
| Archive mailbox переполнен/письмо удалено | Low–Medium | High | Immutable service mailbox, quota alert, retention owner, periodic export/backup decision. |
| Attachment доступен в CRM, но provider уже удалил body | Medium for legacy | Medium | Keep legacy proxy/key; assess snapshot; new archive retention and explicit 410. |
| SMTP/API success ошибочно назван delivery | Existing | Medium | `ACCEPTED/UNKNOWN`; final delivery only by provider event/DSN. |
| Automatic fallback отправляет duplicate | Medium | High | No automatic cross-provider retry; manual cutoff with audit. |
| Timeweb mail outage — единая точка отказа для managers | Low | Critical | Document provider incident process; optional later backup MX only with a real synchronized mailbox provider, not Resend webhook. |
| CRM task storm после backlog | Medium | Medium | Existing per customer/deal dedupe; tasks only for new known inbound; outage drill. |

## Verification

### Automated gates

- [ ] `npx prisma validate`
- [ ] `npm run verify-email-log`
- [ ] `npm run verify-email-inbound`
- [ ] `npm run verify-email-resolve`
- [ ] `npm run verify-auto-task`
- [ ] `npm run verify-email-ingest`
- [ ] `npm run verify-timeweb-imap`
- [ ] `npx vitest run tests/email`
- [ ] `npx tsc --noEmit`
- [ ] `npx eslint .`
- [ ] `npm run build`

### DNS/auth checklist

- [ ] Root MX — только `mx1.timeweb.ru`/`mx2.timeweb.ru`.
- [ ] Ровно одна SPF TXT на каждом owner; Timeweb root и Resend return-path оба проходят.
- [ ] Timeweb test: `spf=pass`, `dkim=pass`, `dmarc=pass`.
- [ ] Resend test: `spf=pass` или aligned `dkim=pass`, `dmarc=pass`; `Reply-To=info@geleoteka.ru`.
- [ ] DMARC `p=none` на миграции, отчёты реально приходят; quarantine/reject не включены преждевременно.
- [ ] DNS проверен минимум из двух public resolvers после TTL window.

### E2E scenarios

#### TS-001: Менеджерская почта при падении платформы

**Priority:** Critical

| Step | Action | Expected Result |
|---|---|---|
| 1 | Остановить web и mail-sync worker | `geleoteka.ru` недоступен, Timeweb mail продолжает работать |
| 2 | Отправить клиенту с телефона manager mailbox; ответить клиентом с вложением | Оба письма видны менеджеру в стандартном клиенте; отправка/приём не зависят от приложения |
| 3 | Восстановить app/worker | Обе стороны появляются в CRM в исходном порядке; исходящее с author, входящее с одной FOLLOW_UP; вложение скачивается |

#### TS-002: Reply на транзакционную смету

**Priority:** Critical

| Step | Action | Expected Result |
|---|---|---|
| 1 | Отправить смету через `sendEstimate`/Resend | `CommunicationLog(EMAIL_OUTBOUND, ACCEPTED)` создан до send; клиент получает письмо |
| 2 | Ответить клиентом | Ответ приходит в Timeweb `info@`, archive и CRM; `In-Reply-To` связывает тот же customer/deal |
| 3 | Повторно replay UID/Resend event | Второго CommunicationLog и второй task нет |

#### TS-003: Новое письмо известного и неизвестного клиента

**Priority:** Critical

| Step | Action | Expected Result |
|---|---|---|
| 1 | Known customer пишет на `info@` без thread headers | Sender match → latest open deal/customer timeline + FOLLOW_UP |
| 2 | Unknown sender пишет на `info@` | `InboxMessage(PENDING, INBOUND)` + InboxBadge |
| 3 | Менеджер связывает unknown с customer | Создаётся EMAIL_INBOUND, sender alias; последующие письма auto-match |

#### TS-004: Новое исходящее с телефона

**Priority:** High

| Step | Action | Expected Result |
|---|---|---|
| 1 | Manager отправляет известному customer новое письмо через iOS/Android | Timeweb outgoing control копирует archive; CRM создаёт EMAIL_OUTBOUND с manager author |
| 2 | Customer отвечает | Thread match → тот же customer/deal; одна FOLLOW_UP |
| 3 | Manager отправляет на неизвестный/multiple customer address | Письмо не угадывается; попадает в unresolved inbox как OUTBOUND для ручной привязки; task нет |

#### TS-005: Все транзакционные шаблоны

**Priority:** High

| Step | Action | Expected Result |
|---|---|---|
| 1 | Booking, registration, parts, rental, estimate | Все пять HTML/text писем отправлены выбранным Resend transport, Message-Id сохранён в CRM |
| 2 | Ответить на каждый тип | Каждый reply проходит Timeweb IMAP и связывается с правильным customer/deal (welcome — customer-only) |

#### TS-006: DNS и deliverability matrix

**Priority:** High

| Step | Action | Expected Result |
|---|---|---|
| 1 | Timeweb SMTP → Gmail/Yandex/Mail.ru | Получено, не hard-spam; SPF/DKIM/DMARC pass |
| 2 | Resend → Gmail/Yandex/Mail.ru | Получено; DKIM/DMARC pass; Reply-To ведёт в Timeweb |
| 3 | Проверить DMARC aggregate report | Оба providers распознаны легитимными; неизвестных high-volume sources нет |

#### TS-007: Cursor, duplicate и dead-letter

**Priority:** Critical

| Step | Action | Expected Result |
|---|---|---|
| 1 | Убить worker после fetch до DB commit | После restart UID обработан один раз |
| 2 | Запустить два workers | Lease/unique constraints не допускают duplicate result |
| 3 | Подать malformed MIME | После retries запись DEAD и alert; следующие UID обработаны |
| 4 | Исправить/повторить replay | DEAD становится PROCESSED или остаётся с понятной ошибкой; cursor/другие письма не повреждены |

## Verification Evidence

Заполняется при выполнении:

| Check | Result | Timestamp / evidence |
|---|---|---|
| Header-preservation spike | PENDING | |
| IMAP/SMTP egress | PENDING | |
| Automated gates | PENDING | |
| TS-001…TS-007 | PENDING | |
| 24h reconciliation | PENDING | |
| 7–14d soak | PENDING | |
| Final transport decision | PENDING | |
