# SEO-панель в админке — Implementation Plan
Created: 2026-08-05
Status: VERIFIED
Mode: auto
Iterations: 0
Type: Feature

## Контекст

После SEO-инициативы 2026-08-03 владельцу нужно место, где виден статус
продвижения без похода по пяти сервисам. Внешние API (Вебмастер/Метрика)
требуют OAuth-токенов — сознательно НЕ берём в этот заход; позиции выдачи
автоматически не снять (капча) — их вносим вручную при замерах «проверь SEO».
Панель = живой техчек (что сервер может проверить сам) + история замеров
с ручными полями (страниц в индексе, заметка о позициях).

## Progress Tracking
- [x] Story 1: Модель SeoSnapshot + сбор техметрик + экшен замера   (Status: VERIFIED — 4/4 юнит-теста (sitemap-счёт, деградация fetch→null, маппинг, валидация ручных полей), tsc чист, миграция применена локально)
- [x] Story 2: Страница /admin/seo + навигация   (Status: VERIFIED — 546/546 (5 тестов seo-health, вкл. withDelta), build чист)

## Implementation Tasks

### Story 1: Модель SeoSnapshot + сбор техметрик + экшен замера
**Objective:** сервер сам собирает всё проверяемое и умеет сохранять слепок.
**Tasks:**
1. Prisma: модель SeoSnapshot (createdAt, sitemapUrls, servicesTotal,
   servicesWithBody, postsPublished, postsDraft, metrikaConfigured,
   verificationConfigured, indexnowConfigured, indexedPages Int? — ручное,
   note String? — ручное). Миграция вручную (локальный migrate dev сломан
   дрейфом): mkdir + SQL + db execute + resolve.
2. lib/seo-health.ts: collectSeoHealth() — fetch собственного /sitemap.xml
   (счёт <loc>, таймаут, при ошибке null), счётчики из БД (services
   total/с body, посты published/draft), статусы Settings (метрика/
   верификация/indexnow заданы). Без внешних сервисов.
3. app/actions/seo.ts: captureSeoSnapshot(_prev, formData) —
   requireRole(ADMIN|MANAGER), collectSeoHealth + ручные поля
   indexedPages/note → insert; revalidate /admin/seo.
**DoD:** юнит-тесты collectSeoHealth (мок fetch/db/settings) и экшена
(роль, маппинг полей, ручные поля опциональны); полный гейт.
Status: PENDING
Iterations: 0

### Story 2: Страница /admin/seo + навигация
**Objective:** панель: живой техчек, форма замера, история с дельтами,
чек-лист владельца со ссылками.
**Tasks:**
1. app/(admin)/admin/seo/page.tsx: карточки техчека (sitemap N URL, метрика,
   верификация, IndexNow, услуги с текстом N/M, статьи опубл/черновики) —
   live через collectSeoHealth; форма «Снять замер» (поля: страниц в индексе,
   заметка); таблица последних ~20 замеров с дельтами к предыдущему.
2. Ссылки: Вебмастер, Метрика (счётчик 111282352), Яндекс Бизнес, /blog.
   Чек-лист владельца (отзывы, вычитка черновиков) — статичный блок.
3. lib/admin-nav.ts: «Сайт» → «SEO»; lib/permissions.ts: /admin/seo →
   content.manage.
**DoD:** страница рендерится (build), тест дельта-хелпера; полный гейт;
после деплоя — ручная проверка /admin/seo владельцем.
Status: PENDING
Iterations: 0
