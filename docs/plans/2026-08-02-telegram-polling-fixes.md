# Telegram Polling Fixes Implementation Plan

Created: 2026-08-02
Status: VERIFIED
Mode: auto
Iterations: 0
Type: Bugfix

Источник: adversarial review codex по ветке `claude/telegram-polling-architecture`,
все 10 находок подтверждены контрольными прогонами (см.
`docs/plans/2026-08-02-telegram-polling-handoff.md` §5 и вердикты в сессии
2026-08-02). План одобрен владельцем, режим — auto.

Инварианты проекта (нарушать нельзя): миграции руками + `prisma migrate deploy`;
в migration.sql никакого дрейфа (Part_photos_gin_idx, Vehicle_photos_gin_idx,
StockMovement); prisma-клиент из `@/app/generated/prisma/client`; политика
содержимого Telegram-сообщений (никаких chat_id/токенов/URL в логах);
`gh pr merge` виснет — мержить через `gh api -X PUT .../merge`.

## Progress Tracking

- [x] Story 1: Миграция — вернуть UPDATES_POLL в CHECK (№6)   (Status: VERIFIED — deploy применён, CHECK из 4 операций в БД, вставка UPDATES_POLL проходит, migrate diff чист (плюс выровнен дефолт updatedAt в схеме))
- [x] Story 2: Карантин ядовитого апдейта (№2 BLOCKER)   (Status: VERIFIED — RED→GREEN: карантин после 3 неудач с обработкой хвоста, transient не карантинится, диагностика UPDATE_QUARANTINED; 8/8 тестов, миграция применена, diff чист)
- [x] Story 3: Single-flight lease + различение 409 через getWebhookInfo (№1)   (Status: VERIFIED — RED→GREEN: skipped-lease без сети, перехват протухшего lease, release на failed, 409+webhook→delete→retry, 409 без webhook→failed без delete; 12/12, миграция leaseUntil, tsc/diff чисты)
- [x] Story 4: Честный wall-clock бюджет drain (№3)   (Status: VERIFIED — RED→GREEN: дедлайн до getWebhookInfo/deleteWebhook, дедлайн внутри батча с подтверждением префикса, сетевой таймаут урезается остатком бюджета (fake timers); 15/15)
- [x] Story 5: Health-contract maintenance: failed drain → 503 (№4)   (Status: VERIFIED — RED→GREEN: failed→503 при выполненных overdue/retention, skipped-*/disabled→200, аргументы drain проверены; 4/4 + строка в runbook)
- [x] Story 6: MINOR-тройка: awaited replies, key на watcher, валидация+secret BASE_URL (№7, №8, №9)   (Status: VERIFIED — break-check: снятие await и secret валит ровно 2 соответствующих теста; 138/138 staff-notifications, tsc чист; №8 — key на LinkStatusWatcher, подтверждено трассировкой)
- [x] Story 7: Runbook: рецепт релея без утечки токена в логи (№5 BLOCKER, docs)   (Status: VERIFIED — wrangler-only деплой, [observability] enabled=false + invocation_logs=false (синтаксис сверен с docs Cloudflare), ложная фраза заменена честным описанием, шаг проверки в дашборде)
- [x] Story 8: Остаточное покрытие №10 + полный локальный гейт   (Status: VERIFIED — тесты updates-runtime (2: disabled без сети, сквозная проводка с awaited-ответом), граница ровно-100; гейт: 448/448 vitest, lint ok, build ok, migrate deploy без pending, diff = только исторический GIN-дрейф)
- [x] Story 9: Сдача: второй adversarial review codex → PR (merge — только с гейтом владельца)   (Status: VERIFIED — ревью №2 получено, подтверждённое исправлено вторым коммитом, остатки записаны; PR #63, CI зелёный, merge одобрен владельцем и выполнен squash (a5c975b), ветка удалена)

## Implementation Tasks

### Story 1: Миграция — вернуть UPDATES_POLL в CHECK (№6)

Objective: диагностика опроса пишется в TelegramSendAttempt; сейчас CHECK в БД
содержит только 3 операции, вставка UPDATES_POLL отбивается и глотается.
Files: `prisma/migrations/20260802200000_restore_updates_poll_operation/migration.sql` (новая).
Дизайн: DROP + ADD `TelegramSendAttempt_operation_check` с полным списком из
4 операций (NOTIFICATION_DELIVERY, WEBHOOK_REPLY, TEST_NOTIFICATION,
UPDATES_POLL). Никаких других изменений в файле.
DoD:
- `prisma migrate deploy` применяется на локальной БД;
- `pg_get_constraintdef` показывает 4 операции;
- фактическая вставка строки с operation=UPDATES_POLL проходит (и откатывается);
- `prisma migrate diff --from-schema-datamodel --to-schema-datasource` не
  показывает расхождений по этой таблице (schema.prisma не меняется — CHECK
  не выражается в Prisma-схеме).

### Story 2: Карантин ядовитого апдейта (№2 BLOCKER)

Objective: стабильно падающий апдейт не должен вечно блокировать очередь.
Files: `prisma/schema.prisma` (+миграция `2026080221xxxx_telegram_poll_quarantine`),
`lib/staff-notifications/channels/telegram/updates.ts`,
`tests/staff-notifications/telegram-updates.test.ts`.
Дизайн: в `TelegramPollState` поля `stuckUpdateId BIGINT NULL`,
`stuckAttempts INT NOT NULL DEFAULT 0`. В drain при исключении processUpdate
для update_id X: если stuckUpdateId != X → записать (X, 1); иначе инкремент.
При достижении 3 попыток: продвинуть офсет до X+1, сбросить stuck-поля,
записать диагностику FAILURE c errorCode UPDATE_QUARANTINED (безопасная
проекция: только update_id в счётчиках, БЕЗ содержимого апдейта) и продолжить
drain. При успехе обработки X — сброс stuck-полей, если они указывали на X.
DoD (контрольные прогоны, RED→GREEN):
- тест: ядовитый апдейт после 3 drain продвигается, хвост за ним
  обрабатывается;
- тест: transient-сбой (1 падение, потом успех) НЕ карантинится и не теряется;
- тест: карантин пишет диагностику UPDATE_QUARANTINED;
- вся существующая семантика офсета сохранена (прежние 6 тестов зелёные).

### Story 3: Single-flight lease + различение 409 (№1)

Objective: перекрывающиеся drain не должны маскироваться под смену режима
webhook↔polling; deleteWebhook только когда webhook реально зарегистрирован.
Files: `lib/staff-notifications/channels/telegram/updates.ts`, schema/миграция
(поле lease в TelegramPollState), тесты.
Дизайн: (а) lease: поле `leaseUntil TIMESTAMP NULL` в TelegramPollState;
захват — CAS `updateMany(where: leaseUntil IS NULL OR < now, data: now+30s)`;
count=0 → status "skipped-lease" (для force-вызова тоже: cron-тик, пришедший
во время живого drain, просто уходит); release в finally (сброс leaseUntil,
только если штамп наш — сравнением значения). (б) 409: перед deleteWebhook
вызвать getWebhookInfo; url непустой → deleteWebhook + retry (текущее
самолечение); url пустой → это конкурентный getUpdates (при lease — уже
экзотика: чужой процесс с тем же токеном) → status failed/TELEGRAM_CONFLICT
БЕЗ deleteWebhook.
DoD (RED→GREEN):
- тест: два конкурентных drain — второй уходит по lease без сетевых вызовов;
- тест: 409 при зарегистрированном webhook (getWebhookInfo.url непуст) →
  deleteWebhook → retry → drained;
- тест: 409 без webhook (url пуст) → failed TELEGRAM_CONFLICT, deleteWebhook
  НЕ вызван;
- тест: lease освобождается после drain (второй drain после завершения
  первого проходит);
- getWebhookInfo не логируется и не попадает в диагностику с URL.

### Story 4: Честный wall-clock бюджет drain (№3)

Objective: budgetMs действительно ограничивает drain, как заявлено в docstring.
Files: `lib/staff-notifications/channels/telegram/updates.ts`, тесты.
Дизайн: дедлайн = start + budgetMs; (а) сетевой таймаут каждого вызова =
min(requestTimeoutMs, остаток дедлайна); (б) проверка дедлайна перед
deleteWebhook и перед КАЖДЫМ processUpdate (при срабатывании — подтвердить
обработанный префикс офсетом и вернуть budget-exhausted); (в) существующая
проверка перед батчем остаётся.
DoD (RED→GREEN):
- тест (фейковые часы): fetch, съевший бюджет, не даёт запуститься
  deleteWebhook/второму вызову — drain выходит budget-exhausted ≤ бюджета
  (сетевые вызовы укорочены остатком);
- тест: медленная обработка батча прерывается на границе дедлайна,
  обработанный префикс подтверждён офсетом, необработанные придут в
  следующем drain;
- прежние тесты зелёные.

### Story 5: Health-contract maintenance (№4)

Objective: мёртвый канал опроса не должен держать cron зелёным.
Files: `app/api/internal/staff-notifications/maintenance/route.ts`,
`tests/staff-notifications/maintenance-route.test.ts`,
`docs/runbooks/staff-notifications.md` (одна строка про контракт).
Дизайн: route выполняет ВСЮ работу (drain → overdue → retention), затем если
`updates.status === "failed"` → отвечает 503 `{ok:false, updates, overdue,
retention}`; остальные статусы (drained, budget-exhausted, skipped-cooldown,
skipped-lease, channel-disabled) → 200. Workflow уже фейлит non-200 — правок
в yml не требуется.
DoD (RED→GREEN):
- тест: drain failed → 503, при этом overdue и retention ВЫПОЛНЕНЫ;
- тест: drain drained/channel-disabled → 200;
- тест: аргументы drainTelegramUpdatesNow проверяются ({force:true,
  budgetMs:6000, maxBatches:3}).

### Story 6: MINOR-тройка (№7, №8, №9)

Objective: три подтверждённых MINOR одним связным заходом.
Files: `lib/staff-notifications/channels/telegram/webhook.ts`,
`updates-runtime.ts`, `components/admin/notifications/TelegramLinkPanel.tsx`,
`lib/settings.ts`, `lib/settings-validation.ts`, тесты.
Дизайн:
- №7: тип `TelegramWebhookReplyScheduler` → `(reply) => void | Promise<void>`;
  в `processTelegramWebhookUpdate` вызов через `await`; webhook-роут с
  `after()` не меняется (его колбэк остаётся синхронным планированием).
- №8: `<LinkStatusWatcher key={expiresAt ?? "no-deadline"} …>` — новая ссылка
  = новый watcher со свежим phase="waiting".
- №9: в `validateSettingValue` ветка TELEGRAM_API_BASE_URL через
  `normalizeTelegramApiBaseUrl` (пусто → ok/пустая строка; невалидное →
  ошибка с человеческим текстом); дескриптор получает `secret: true,
  input: "secret"` (открытый релей = им может пользоваться любой знающий
  адрес; сам runbook требует беречь как токен).
DoD (RED→GREEN):
- тест №7: processTelegramWebhookUpdate завершает async-ответ ДО возврата
  (обращение вчерашнего контрольного прогона);
- №8: контрольная проверка через unit-логику компонента невозможна без RTL —
  доказательство: чтение дерева (key меняет identity) + ручная проверка
  сборки; отдельный тест не требуется, фикс однострочный;
- тест №9: `http://…`, URL с credentials/query — отклоняются при сохранении;
  валидный https и пустая строка — проходят; страница интеграций больше не
  сериализует значение (secret).

### Story 7: Runbook — рецепт релея без утечки токена (№5 BLOCKER, docs)

Objective: следование рецепту не должно оставлять bot token в логах Cloudflare.
Files: `docs/runbooks/staff-notifications.md`.
Дизайн: рецепт разворачивается ТОЛЬКО через wrangler с явным
`[observability] enabled = false` (+ `logpush = false`), предупреждение: не
создавать через дашборд (observability включена по умолчанию), не включать
Workers Logs/Logpush/tail в проде; убрать ложную фразу «Worker не хранит и не
логирует токен», заменить честным описанием: токен идёт в path каждого
запроса, поэтому логирование запросов у релея обязано быть выключено; шаг
проверки: в дашборде Workers → Observability пусто/выключено.
DoD: текст согласован с docs Cloudflare (observability default on, invocation
log содержит Method+URL, retention 3–7 дней); упоминаний «не логирует» без
условий нет; lint/markdown ок.

### Story 8: Остаточное покрытие №10 + полный локальный гейт

Objective: закрыть дыры покрытия, не принадлежащие конкретному фиксу, и
прогнать полный гейт.
Files: `tests/staff-notifications/telegram-updates-runtime.test.ts` (новый),
`tests/staff-notifications/telegram-updates.test.ts`.
Дизайн: (а) тесты обвязки updates-runtime: канал выключен → channel-disabled
без сетевых вызовов; включён → drain получает правильные apiBaseUrl/botToken,
processUpdate доводит апдейт до processTelegramWebhookUpdate (мок fetch,
фейковый db); ответ бота реально awaited (после Story 6). (б) тест
продолжения при ровно 100 апдейтах в батче (граница batch-limit). (в) гейт:
`tsc --noEmit`, `npm run lint`, полный `vitest run`, `npm run build`,
`prisma migrate deploy` на чистой локальной проверке + `prisma migrate diff`
(доказательство соответствия схеме, известный дрейф не в счёт).
DoD: всё зелёное; в diff нет наших артефактов (только известный
исторический дрейф).

### Итоги второго ревью codex (по 73a3c1b) и вердикты

Отчёт: `.omc/artifacts/ask/codex-adversarial-review-claude-telegram-polling-architecture-73a3-*.md`.
Вердикт codex: №5–№9 закрыты; №1–№4, №10 частично. Моя проверка и решения:

- ПОДТВЕРЖДЕНО и исправлено (второй коммит):
  - №1: lease не продлевался → продление CAS перед каждым батчем; перехват →
    стоп с TELEGRAM_CONFLICT без порчи чужого состояния.
  - №2: попытки карантина сжигались панельным опросом за секунды → spacing
    60 с (`stuckLastAt`); след update_id в AuditLog для расследования.
  - №4: release в finally без try/catch мог сорвать overdue/retention →
    заглушен с console.error; budget-exhausted при processed=0 → 503.
  - №10: тесты на всё перечисленное (5 RED → GREEN).
- ПОДТВЕРЖДЕНО, принято как осознанный остаток (не чинится, причина записана):
  - №2 «необратимый drop без replay»: полный DLQ требует хранить сырой апдейт —
    прямо запрещено политикой владельца; spacing даёт ≥3 мин устойчивого сбоя
    до карантина, след — update_id в AuditLog.
  - №2 «malformed update_id зацикливает зелёный тик»: возможно только при
    повреждающем релее (Telegram гарантирует update_id); самоизлечивается
    продвижением офсета соседями.
  - №1 «clock skew реплик»: приложение — один инстанс; горизонт lease 30 с
    на порядок больше реалистичного skew.
  - №3 «начатая обработка не прерывается»: хвост ограничен одним апдейтом,
    владение на это время держит продлеваемый lease; проброс отмены в
    транзакцию и адаптер несоразмерен риску. Задокументировано в docstring.
  - №10 «нет теста на настоящем Postgres CAS»: в репозитории нет DB-харнесса
    для тестов; CAS — стандартный updateMany WHERE, семантика покрыта fake.

### Story 9: Сдача — второй adversarial review codex → PR

Objective: внешняя проверка исправленного кода и подготовка PR.
Risk: HIGH (исход — merge в main = автодеплой на прод) → гейт владельца
обязателен даже в auto-режиме.
Дизайн: (а) закоммитить работу поверх ветки; (б) второй заход codex
(`node ~/.claude/plugins/cache/omc/oh-my-claudecode/4.15.7/bin/oh-my-claudecode.js
ask codex --prompt …`, ждать одним ожидателем `while pgrep -f "ask codex"`);
(в) каждую новую находку — верифицировать своим прогоном (codex уже выдумывал
факты), подтверждённое чинить, опровергнутое письменно отклонить; (г) открыть
PR в `0pt1m1sm/geleoteka` (main), дождаться CI; (д) СТОП — merge только после
подтверждения владельца (гейт: merge через `gh api -X PUT …/merge
-f merge_method=squash`, ветку почистить).
DoD: PR открыт, CI зелёный, отчёт по находкам второго ревью приложен,
merge-гейт показан владельцу.
