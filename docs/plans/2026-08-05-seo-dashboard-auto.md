# SEO-панель: автоматические данные из API Яндекса — Implementation Plan
Created: 2026-08-05
Status: VERIFIED
Mode: auto
Iterations: 0
Type: Feature

## Контекст

Владелец отверг ручные замеры («какой смысл») — панель должна показывать
динамику сама. Источники, которые Яндекс отдаёт легально по OAuth-токену:
- **Вебмастер API v4** (scope webmaster:read... фактические скоупы сверить в
  доках): страницы в поиске, SQI, популярные запросы с показами/кликами/
  средней позицией.
- **Метрика Stat API** (счётчик 111282352): визиты из поисковых систем по
  дням, поисковые фразы.
Токен — один на оба API, хранится в Setting YANDEX_OAUTH_TOKEN (secret).
Без токена панель показывает инструкцию по получению, живой техчек остаётся.

## Progress Tracking
- [x] Story 1: Клиент Вебмастер API + Setting токена   (Status: VERIFIED — эндпоинты сверены с доками, 3 теста: без токена/happy/403)
- [x] Story 2: Клиент Метрика Stat API   (Status: VERIFIED — 2 теста: без токена, маппинг дней/фраз и суммы 7d/30d)
- [x] Story 3: Авто-снапшоты (крон в воркере + расширение модели)   (Status: VERIFIED — 4 теста тика (суточный гейт, маппинг API, деградация, db-сбой), 6 тестов воркера не сломаны)
- [x] Story 4: Дашборд с графиками (SVG-спарклайны, без библиотек)   (Status: VERIFIED — 556/556, build чист; метрик-карты, 2 спарклайна, топ запросов, инструкция токена, история слепков)

## Implementation Tasks

### Story 1: Клиент Вебмастер API + Setting токена
1. Сверить эндпоинты по официальным докам (обязательно: точные пути и поля).
2. Setting YANDEX_OAUTH_TOKEN (secret, группа «SEO и аналитика»).
3. lib/yandex-webmaster.ts: fetchWebmasterSummary() — user_id → host_id
   (кэш в модуле), summary (страницы в поиске, SQI), popularQueries (top-10:
   запрос, показы, клики, средняя позиция). Ошибки/нет токена → null,
   никогда не роняем страницу. Таймауты.
4. Тесты с мок-fetch: happy path, нет токена, 4xx.
**DoD:** тесты зелёные, tsc.
Status: PENDING
Iterations: 0

### Story 2: Клиент Метрика Stat API
1. lib/yandex-metrika-api.ts: fetchSearchTraffic() — визиты из поиска по
   дням за 30 дней (organic), суммарно за 7 дней; topSearchPhrases (top-10).
   Тот же токен, те же правила деградации.
2. Тесты с мок-fetch.
**DoD:** тесты зелёные, tsc.
Status: PENDING
Iterations: 0

### Story 3: Авто-снапшоты
1. SeoSnapshot + поля: source ("auto"|"manual"), indexedPagesApi Int?,
   sqi Int?, searchVisits7d Int? — миграция вручную (дрейф).
2. lib/seo-snapshot.ts: runSeoSnapshotTick() — раз в сутки (гейт по
   последнему auto-снапшоту), собирает collectSeoHealth + Вебмастер +
   Метрика, пишет source=auto. Подключить в poll-worker
   (BackgroundWorkerJobs) и instrumentation.ts по образцу mailSyncTick.
3. Экшен captureSeoSnapshot остаётся (source=manual, для заметок), форма
   упрощается до одной заметки.
**DoD:** тест тика (гейт суточный, маппинг), тест воркера не сломан; гейт.
Status: PENDING
Iterations: 0

### Story 4: Дашборд с графиками
1. components/admin/Sparkline.tsx — чистый SVG-спарклайн (без библиотек).
2. /admin/seo: блоки — «Страницы в поиске» (динамика по снапшотам + текущее
   из API), «Визиты из поиска, 30 дней» (график по дням из Метрики live),
   «Топ запросов» (таблица: запрос/показы/клики/позиция из Вебмастера),
   техчек остаётся; без токена — инструкция получения (oauth.yandex.ru,
   нужные права, куда вставить).
3. Ручная форма → только заметка.
**DoD:** SSR-рендер в build, тест Sparkline-пути (точки → path d), полный
гейт; после деплоя — проверка страницы.
Status: PENDING
Iterations: 0
