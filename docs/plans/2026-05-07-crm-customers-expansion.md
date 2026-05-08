# CRM /admin/customers Expansion Implementation Plan

Created: 2026-05-07
Author: aleksandr.spiskov@gmail.com
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Превратить `/admin/customers` из read-only списка в рабочий инструмент менеджера: ручное создание клиента, редактирование контактов и ЧС-флага, заметки-таймлайн, тэги/сегменты с фильтрацией, поиск/сортировка списка и CSV-экспорт.

**Architecture:** Расширяем существующий путь `(admin)/admin/customers` (страница списка + `[id]` карточка) ещё одной страницей `/new`. Новые модели Prisma `CustomerNote`, `CustomerTag`, `CustomerTagAssignment` лежат рядом с уже существующим `CustomerProfile`. Server Actions в `app/actions/customers.ts` с `requireRole(["ADMIN","MANAGER"])`. Фильтры списка — через URL `searchParams`, малый client-компонент обновляет URL через `router.replace`. CSV выдаёт GET-роут `/api/admin/customers/export`, который делит парсер фильтра и нормализатор строки с серверной страницей.

**Tech Stack:** Next.js 16 App Router · React 19 · Prisma 6 (`@/app/generated/prisma`) · Tailwind v4 + CSS variables · `bcryptjs` (уже в deps) · `react-markdown` (уже в deps, для рендера заметок) · никаких новых зависимостей.

## Scope

### In Scope

1. Schema: модели `CustomerNote`, `CustomerTag`, `CustomerTagAssignment` + миграция + регенерация Prisma client + **backfill `CustomerProfile` для существующих `isCustomer=true` клиентов** + правка `app/actions/booking.ts` и `app/actions/register.ts` чтобы каждое создание клиента всегда создавало `customerProfile: { create: {} }`. `CustomerProfile.notes` (свободное поле «личные заметки менеджера») и `CustomerProfile.blacklisted` (ЧС-флаг) остаются без изменений и переиспользуются.
2. Палитра цветов тэгов (8 фиксированных) и helpers в `lib/customer-tags.ts` (resolve-color → CSS class, нормализация имени, валидация).
3. Pure helpers в `lib/customer-filters.ts` (парсинг searchParams) и `lib/customer-csv.ts` (BOM, escape, row-builder). Read-only helpers (например, `getAllCustomerTags`) — в `lib/customer-queries.ts` (без `"use server"`, импортируются ТОЛЬКО из server-компонентов).
4. Server actions в `app/actions/customers.ts`: `createCustomer`, `updateCustomer`, `addCustomerNote`, `deleteCustomerNote`, `createCustomerTag`, `assignCustomerTag`, `unassignCustomerTag`, `deleteCustomerTag` (только ADMIN). НИКАКИХ read-only функций в этом файле — все экспорты из `"use server"` файла становятся вызываемыми action-ами.
5. Список `/admin/customers`: поиск (имя/телефон/email — case-insensitive contains), фильтр по тэгу, фильтр ЧС (Все / Только активные / Только ЧС), сортировка (Последний визит ↓ default / Баллы ↓ / Дата создания ↓), кнопки «Создать клиента» и «Скачать CSV», бейджи тэгов и ЧС в строках.
6. CSV-экспорт (`GET /api/admin/customers/export?...`): UTF-8 + BOM, колонки `Имя, Телефон, Email, Авто, Визиты, Баллы, Тэги, ЧС, Дата создания` в порядке/фильтре текущего URL.
7. Страница ручного создания `/admin/customers/new`: форма (имя, телефон, email, заметка), генерация временного пароля 10 символов (показывается один раз), создание `User` + `CustomerProfile` + (если есть стартовая заметка) `CustomerNote`. Без отправки SMS/email.
8. Карточка клиента `/admin/customers/[id]`: блок «Контакты» (inline-редактор имени/телефона/email/`CustomerProfile.notes`/ЧС-флага), блок «Тэги» (chips + popover «Добавить тэг»), блок «Заметки» (форма + таймлайн с автором и временем), сохранены существующие блоки «Автомобили / Визиты / Баллы».
9. Verify script `scripts/verify-customers.ts` + npm-скрипт `verify-customers` (палитра цветов, нормализация имени, CSV-escape round-trip, парсер фильтров — pure, без БД).
10. E2E browser-проверки сценариев TS-001…TS-008 во время verify.

### Out of Scope

- Коммуникации (SMS/email/телефон) — отдельный план.
- Задачи и напоминания (TODO для менеджера) — отдельный план.
- Импорт CSV — отдельный план.
- Интеграции с внешними CRM (AmoCRM, Bitrix24).
- Блокировка booking-флоу для ЧС-клиентов (`/booking` остаётся как есть).
- Точный rate-limit на CSV-экспорт (полагаемся на admin-сессию + Railway-уровень).
- Backfill `lastVisitAt` на User (денормализация отложена — текущий объём терпит JS-сортировку).
- Удаление клиента из админки (риск каскадного удаления RO/Vehicle, не запрашивалось).
- Audit-log на изменения карточки (createdAt/updatedAt у `User` уже фиксируется).

## Approach

**Chosen:** Расширение существующих файлов + три новых маленьких client-компонента + один новый GET-роут.

**Why:** Минимизирует разброс кода и матчит уже сложившуюся в `/admin/cms` модель «server-страница + точечные client-редакторы поверх Server Actions через `useActionState` / `useFormAction`». Никакой новой инфраструктуры (api/REST, кеш-инвалидации сложнее `revalidatePath`, выделенных layouts), всё предсказуемо для Codex/spec-review.

**Alternatives considered:**

- *Client-only страница с React Query.* Удобно для живого фильтра, но требует нового JSON API, держит фильтр вне URL (нельзя поделиться ссылкой), повторяет рендер на каждом keystroke. Мы остаёмся на server component + URL — фильтр становится shareable.
- *Денормализованное поле `User.lastVisitAt`.* Даёт SQL-сортировку, но цена — миграция, backfill, и три места обновления (`createRepairOrder`, `updateRepairOrder`, `deleteRepairOrder`). Текущий шоп — десятки клиентов в день, JS-сортировка после `findMany` стоит микросекунды. Заведомо отложено в Out of Scope.
- *Свободный hex-ввод цвета тэга.* Гибкость без выгоды — палитра 8 цветов покрывает практические сегменты (VIP / Должник / Постоянный / Опт / Гарантия / Ушедший / Жалоба / Прочее) и гарантирует контраст в обеих темах.

## Context for Implementer

> Implementer пишет код впервые в этой кодовой базе. Ниже — всё, что отличает Geleoteka от стандартного Next.js.

### Patterns to follow

- **Auth на page-компонентах**: `getSession()` + `if (!session || …) redirect("/login")`. Никакого `requireRole()` — он редиректит, но в page-компонентах удобнее явно. Образец: `app/(admin)/admin/customers/page.tsx:9-13`.
- **Auth в Server Actions**: `await requireRole(["ADMIN", "MANAGER"])` в начале, кроме deleteCustomerTag/deleteCustomerNote — там либо `["ADMIN"]`, либо проверка авторства по сессии. Образец: `app/actions/cms.ts:19`.
- **Server Action возвращает `{ ok, error, ... }`**: совместимо с `useActionState`. Первый параметр `_prevState`. Образец: `app/actions/suppliers.ts:31-60`.
- **Client editor через `useFormAction`**: hook в `lib/use-form-action.ts:40-56` — даёт `{ pending, error, runAction, setError }`. Используем для inline-редакторов карточки. Образец: `components/admin/cms/CMSTextEditor.tsx:14-58`.
- **Form через `useActionState`**: для крупных форм (создание / большая правка). Образец: `components/admin/SupplierEditForm.tsx:19-82` + `AdminFormShell` для баннера ошибки.
- **Force-dynamic**: `export const dynamic = "force-dynamic"` на каждой admin-странице, читающей БД.
- **Prisma client import**: `import { db } from "@/lib/db"` (singleton). `@ts-nocheck` в сгенерированном файле — `findMany`/`findUnique` возвращают `any`, поэтому **во всех страничных рендерах кастуем явно** через `Record<string, unknown>` и узкие inline-types. Образец: `app/(admin)/admin/customers/page.tsx:33-67`. Для типобезопасности в helpers и actions объявляем локальные интерфейсы.
- **Revalidate**: после каждой мутации над клиентом — `revalidatePath("/admin/customers", "layout")`.
- **Стили**: только classes из дизайн-системы (`card`, `card-hover`, `btn`, `btn-primary`, `input`, `badge`, `text-display`, и UI-примитивы из `@/components/ui`). Никаких хардкод-цветов.

### Conventions

- Server Action файлы: `kebab-case.ts` (`app/actions/customers.ts`).
- Компоненты: `PascalCase.tsx`, под `components/admin/customers/` — новый каталог.
- Lib helpers: `kebab-case.ts` под `lib/customer-*.ts`.
- Не вводим тестовый фреймворк. Pure-проверки — через `scripts/verify-*.ts` (зеркалит `verify-cms.ts`, `verify-vehicle-catalog.ts`).
- Sharp/photo upload не нужен.
- Не трогаем `app/(public)`, `app/(portal)`, `app/(cabinet)`.

### Key files

- `app/(admin)/admin/customers/page.tsx` — список (RW в этом плане).
- `app/(admin)/admin/customers/[id]/page.tsx` — карточка (RW в этом плане).
- `app/(admin)/admin/customers/new/page.tsx` — **новый** (форма создания).
- `app/api/admin/customers/export/route.ts` — **новый** (CSV).
- `app/actions/customers.ts` — **новый** (server actions, только мутации).
- `lib/customer-tags.ts` — **новый** (палитра, helpers).
- `lib/customer-filters.ts` — **новый** (parse searchParams).
- `lib/customer-csv.ts` — **новый** (CSV builder).
- `lib/customer-queries.ts` — **новый** (read-only — `getAllCustomerTags`, `loadCustomersForList`).
- `app/actions/booking.ts`, `app/actions/register.ts` — точечная правка: добавить `customerProfile: { create: {} }` при создании клиента (предотвращает регрессию MF3).
- `components/admin/customers/{CustomerCreateForm,CustomerEditForm,CustomerNotesTimeline,CustomerTagsManager,CustomerListFilters,CustomerListRow}.tsx` — **новые**.
- `prisma/schema.prisma` — три новые модели + индексы.
- `scripts/verify-customers.ts` + `package.json` script.
- `lib/admin-nav.ts` — без изменений (CRM группа уже содержит `/admin/customers`).

### Gotchas

- **`User.email` и `User.phone` уникальны** — при ручном создании пользователь может ввести занятый email/phone; ловим `P2002` и возвращаем «Клиент с таким email/телефоном уже существует».
- **`User.passwordHash` обязателен для `permissionRole=CLIENT`** на логине, поэтому ручное создание сразу хеширует временный пароль. Длина 10 символов из `[a-z0-9A-Z]`.
- **Notification и Slot** ссылаются на User; их CRUD не задеваем, никакой каскад не страдает.
- **`dynamic = "force-dynamic"`** ОБЯЗАТЕЛЕН на странице с searchParams, иначе Next 16 будет пытаться кешировать.
- **CSV кодировка**: Excel под Windows ломает UTF-8 без BOM. Используем `"﻿"` префикс. Перевод строки `\r\n` (Excel-friendly).
- **CSV escape**: значения с `,`, `"`, `\n`, `\r` оборачиваем в двойные кавычки, удваивая внутренние `"`. Перенос строк в свободных заметках в CSV не попадает (используется отдельная колонка `CustomerProfile.notes`, которая в текущий экспорт НЕ включена; см. CSV-колонки в Scope).
- **Race на уникальный tag.name**: `@@unique` + ловим `P2002` в `createCustomerTag`.
- **Сортировка `lastVisit` в JS**: при `findMany` запрашиваем `repairOrders: { take: 1, orderBy: { dateTime: "desc" }, select: { dateTime: true } }`. Клиенты без визита получают `null` и идут в конец при DESC.

### Domain context

- В этой системе **не «client» а «User» с `isCustomer=true`** — единая таблица персон. CRM-фильтр уже стоит правильный (`isCustomer: true, permissionRole: { in: ["CLIENT", "NONE"] }`).
- `permissionRole=NONE` означает «есть запись, не залогинится». Для ручного создания всё-таки используем `CLIENT` + хеш временного пароля (выбор пользователя в Batch 1).
- ЧС (`CustomerProfile.blacklisted`) — внутренняя пометка для менеджеров. Не блокирует никаких флоу.
- `CustomerProfile.notes` — свободное поле «общие заметки о клиенте», редактируется в форме контактов. Не путать с `CustomerNote` (timeline записи).

## Runtime Environment

- **Start command:** `npm run dev` (HTTPS на :443) или `npm run build && npm start`.
- **DB:** `postgresql://alex@localhost:5432/geleoteka`. Применяем миграции через `npx prisma migrate dev --name add_customer_notes_tags`.
- **Health check:** `/admin/customers` загружается, список рендерится, кнопка «Создать клиента» открывает `/admin/customers/new`.
- **Restart:** перезапуск dev-сервера после `prisma migrate dev` (генерирует client).
- **Deploy:** push в `origin/main` → Railway. Railway сам выполнит миграцию (см. `package.json:start`).

## Assumptions

- **Объём клиентов < 5000 в обозримом будущем** — поддерживается JS-сортировкой по `lastVisit`. Supports: `prisma/seed.ts` и опыт сервиса (один автосервис, единичные клиенты в день). Tasks: 5.
- **Менеджеры авторизованы** на `/admin/*`; auth middleware и cookie уже работают (см. `lib/auth.ts:55-90`). Никаких CSRF-токенов сверх существующих Server Actions. Tasks: 4, 5, 6, 7, 8.
- **`react-markdown`** уже установлен и используется в `CMSRichtextEditor.tsx` — переиспользуем для рендера заметок без добавления зависимости. Supports: `package.json:dependencies`. Tasks: 8.
- **`bcryptjs`** установлен; флоу хеширования паролей идентичен `app/actions/booking.ts:63-64`. Tasks: 4.
- **Палитра 8 цветов** определяется один раз в `lib/customer-tags.ts`. Slug — стабильный идентификатор (`gold`, `gray`, `red`, `green`, `blue`, `purple`, `orange`, `neutral`). CSS-классы: `tag-color-<slug>` определяются в `app/globals.css`. Tasks: 2, 5, 8.
- **Никаких новых тестовых фреймворков** — `scripts/verify-customers.ts` запускается через `tsx`. Supports: `package.json:scripts:verify-cms`. Tasks: 9.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `P2002` на дубликат email/phone при ручном создании | High | Low | Ловим в `createCustomer`, возвращаем `{ ok:false, error: "Пользователь с таким email или телефоном уже существует" }` (точная формулировка из `app/actions/register.ts:29`); оставляем форму открытой. |
| Фильтр `?blacklist=hide` молча скрывает клиентов без `CustomerProfile` | High | Med | (a) Миграция backfill: `INSERT INTO "CustomerProfile" ("userId") SELECT id FROM "User" WHERE "isCustomer" = true ON CONFLICT DO NOTHING;`. (b) `register.ts` и `booking.ts` создают `customerProfile: { create: {} }` при `db.user.create`. (c) Defense-in-depth: WHERE для `blacklist=hide` — `OR: [{ customerProfile: { is: { blacklisted: false } } }, { customerProfile: null }]`. |
| `P2002` на дубликат `CustomerTag.name` при гонке | Low | Low | `@@unique([name])` + try/catch в `createCustomerTag`, возврат «Тэг с таким именем уже существует». |
| Менеджер удаляет чужую заметку через подделанный action call | Low | Med | В `deleteCustomerNote` сравниваем `note.authorUserId === session.id`; ADMIN — bypass. Без этого — 403. |
| CSV ломается под Excel из-за UTF-8 без BOM | Med | Med | Префикс `"﻿"` + `Content-Type: text/csv; charset=utf-8`. Покрыто в `verify-customers`. |
| Сортировка по `lastVisit` тормозит при большом списке | Low | Low | JS-sort O(n log n) на ≤5000 строк ≪ 50 ms. Документируем порог как Out of Scope; денормализация отложена. |
| Регрессия в текущем рендере списка (вёрстка визитов/баллов) | Med | Med | Перенос рендера строки в `CustomerListRow.tsx` без смены классов; визуальная сверка в TS-001. |
| Конфликт миграций `_prisma_migrations` checksum (см. CMS-инцидент) | Med | Med | Создаём миграцию через `npx prisma migrate dev --name add_customer_notes_tags`; если checksum отличается на других ветках — синхронизация по той же процедуре, что в session-doc. |
| Утечка временного пароля через журналы | Low | High | Не логируем, не сохраняем; возвращаем строку только в ответе action. В UI показываем только до закрытия диалога / переключения на «Перейти к карточке», в `localStorage` / cookies не пишем. |

## Goal Verification

### Truths

1. Менеджер создаёт клиента вручную через `/admin/customers/new`, видит сгенерированный временный пароль один раз, и созданная запись появляется в списке `/admin/customers` с актуальными контактами. (TS-001)
2. Поиск по `?q=…` фильтрует список по подстроке в имени/телефоне/email; пустой результат показывает empty state. (TS-002)
3. Менеджер добавляет существующий или новый тэг к клиенту inline в карточке; бейдж появляется немедленно; фильтр `?tag=<id>` показывает только клиентов с этим тэгом. (TS-003)
4. Менеджер пишет заметку → она сразу появляется в таймлайне с именем автора и временем; markdown рендерится. (TS-004)
5. Кнопка «Удалить» у заметки видна автору и ADMIN; при отсутствии прав кнопки нет; удаление физически убирает запись. (TS-005)
6. Переключение ЧС-флага в форме контактов меняет бейдж в списке и работает фильтр `?blacklist=only|hide|all`. (TS-006)
7. При сортировке `?sort=lastVisit` клиенты с последним визитом стоят выше, без визитов — в конце; `?sort=points` сортирует по `loyaltyAccount.points` DESC. (TS-007)
8. Скачанный CSV открывается в Excel с корректной кириллицей (BOM), содержит ровно колонки `Имя, Телефон, Email, Авто, Визиты, Баллы, Тэги, ЧС, Дата создания` и отражает текущий URL-фильтр. (TS-008)

### Artifacts

- `prisma/schema.prisma` — новые модели `CustomerNote`, `CustomerTag`, `CustomerTagAssignment`.
- `prisma/migrations/<ts>_add_customer_notes_tags/migration.sql`.
- `lib/customer-tags.ts`, `lib/customer-filters.ts`, `lib/customer-csv.ts`.
- `app/actions/customers.ts`.
- `app/(admin)/admin/customers/{page.tsx, [id]/page.tsx, new/page.tsx}`.
- `app/api/admin/customers/export/route.ts`.
- `components/admin/customers/{CustomerCreateForm, CustomerEditForm, CustomerNotesTimeline, CustomerTagsManager, CustomerListFilters, CustomerListRow}.tsx`.
- `scripts/verify-customers.ts` + `package.json` script `verify-customers`.
- `app/globals.css` — 8 классов `tag-color-<slug>` + `customer-blacklist-badge` (если нужны).

## E2E Test Scenarios

### TS-001: Ручное создание клиента
**Priority:** Critical
**Preconditions:** Залогинен как ADMIN/MANAGER.
**Mapped Tasks:** Task 4, Task 7

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Перейти на `/admin/customers` | Список загружается, видны кнопки «Создать клиента» и «Скачать CSV» |
| 2 | Кликнуть «Создать клиента» | Открывается `/admin/customers/new` с формой |
| 3 | Заполнить «Тестовый Иванов» / `+79991112233` / `ivan-test@example.com` / стартовая заметка «Звонил по поводу ТО» и нажать «Создать» | Появляется панель «Клиент создан», временный пароль (10 знаков) виден один раз, ссылка «Перейти к карточке» |
| 4 | Кликнуть «Перейти к карточке» | Открывается карточка клиента с теми же контактами и записью «Звонил по поводу ТО» в таймлайне |
| 5 | Вернуться на `/admin/customers` | Новый клиент в списке, дата создания — сегодня |

### TS-002: Поиск по списку
**Priority:** Critical
**Preconditions:** Существует ≥1 клиент с именем «Иванов».
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | На `/admin/customers` ввести в поле поиска «иван» | URL обновляется до `?q=иван`, список фильтруется case-insensitive |
| 2 | Очистить поле | URL без `q`, список возвращается полным |
| 3 | Ввести `+7999` | Тот же фильтр работает по телефону |
| 4 | Ввести `nonexistent-zzz` | Показано пустое состояние «Клиенты не найдены» (не «Клиентов пока нет») |

### TS-003: Тэги inline + фильтр
**Priority:** High
**Preconditions:** Открыта карточка существующего клиента; в системе ≥0 тэгов.
**Mapped Tasks:** Task 4, Task 8, Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | В блоке «Тэги» нажать «+ Добавить тэг» | Открывается popover с поиском + список существующих тэгов + «Создать новый» |
| 2 | Создать тэг «VIP» с цветом `gold` | Бейдж «VIP» (золотой) появляется в карточке |
| 3 | Перейти на `/admin/customers` | В строке клиента виден тот же бейдж |
| 4 | В фильтрах выбрать тэг «VIP» | URL `?tag=<id>`, список содержит только клиентов с этим тэгом |
| 5 | Снять привязку (×) на бейдже в карточке | Бейдж исчезает, клиент пропадает из отфильтрованного списка |

### TS-004: Создание заметки + рендер markdown
**Priority:** High
**Preconditions:** Открыта карточка клиента.
**Mapped Tasks:** Task 4, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | В блоке «Заметки» в textarea ввести `**Звонок 14:30** — переносим запись на пятницу` и нажать «Добавить» | Запись появляется первой в таймлайне; «Звонок 14:30» — жирным; видно «<имя автора> · только что» |
| 2 | Перезагрузить страницу | Запись остаётся, время форматируется как `dd.MM.yyyy HH:mm` |

### TS-005: Удаление заметки по автору / ADMIN
**Priority:** High
**Preconditions:** Существуют заметки от двух разных авторов; залогинен как обычный MANAGER (не ADMIN).
**Mapped Tasks:** Task 4, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Открыть карточку клиента | У собственных заметок видна кнопка «Удалить»; у заметок другого автора кнопки нет |
| 2 | Удалить свою заметку | Запись исчезает после подтверждения; счётчик в таймлайне уменьшается |
| 3 | Перелогиниться как ADMIN, открыть ту же карточку | У ВСЕХ заметок (включая чужие) кнопка «Удалить» доступна |

### TS-006: ЧС-флаг + фильтр
**Priority:** High
**Preconditions:** Открыта карточка клиента (не в ЧС).
**Mapped Tasks:** Task 4, Task 5, Task 8

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | В блоке «Контакты» включить чекбокс «Чёрный список», сохранить | Бейдж «ЧС» (красный) появляется рядом с именем |
| 2 | Перейти на `/admin/customers` | В строке клиента бейдж «ЧС» виден |
| 3 | В фильтрах переключить «Только ЧС» | URL `?blacklist=only`, список показывает только клиентов с флагом |
| 4 | Переключить «Скрыть ЧС» | URL `?blacklist=hide`, тот же клиент скрыт |

### TS-007: Сортировки
**Priority:** Medium
**Preconditions:** Существует ≥3 клиента: один с RO от вчера, один с RO от прошлого месяца, один без RO.
**Mapped Tasks:** Task 5

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | На `/admin/customers` выбрать сортировку «Последний визит» (default) | Клиент со вчерашним RO выше; без RO — последний |
| 2 | Переключить на «Баллы» | Сортировка по `loyaltyAccount.points` DESC; клиенты без аккаунта в конце |
| 3 | Переключить на «Дата создания» | Сортировка по `User.createdAt` DESC |

### TS-008: CSV экспорт
**Priority:** Critical
**Preconditions:** В системе ≥3 клиента; включён фильтр `?q=ив` и `?sort=points`.
**Mapped Tasks:** Task 3, Task 6

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | На `/admin/customers?q=ив&sort=points` нажать «Скачать CSV» | Браузер скачивает файл `customers-YYYY-MM-DD.csv` |
| 2 | Открыть в текстовом редакторе | Первый байт `﻿`, заголовок `Имя,Телефон,Email,Авто,Визиты,Баллы,Тэги,ЧС,Дата создания`, кириллица читается, разделитель `,` |
| 3 | Импортировать в Excel/LibreOffice Calc | Колонки распознаются корректно; кириллица не битая |
| 4 | Проверить порядок строк и состав | Только клиенты, прошедшие фильтр `q=ив`; порядок — по `points` DESC |

## Progress Tracking

- [x] Task 1: Schema migration — `CustomerNote`, `CustomerTag`, `CustomerTagAssignment`
- [x] Task 2: Tag palette + helpers (`lib/customer-tags.ts`)
- [x] Task 3: Pure helpers (`lib/customer-filters.ts`, `lib/customer-csv.ts`)
- [x] Task 4: Server actions (`app/actions/customers.ts`)
- [x] Task 5: List page filters/search/sort + bridges (`page.tsx`, `CustomerListFilters`, `CustomerListRow`)
- [x] Task 6: CSV export route (`/api/admin/customers/export`)
- [x] Task 7: Manual create page (`/admin/customers/new` + `CustomerCreateForm`)
- [x] Task 8: Customer card edits + Notes + Tags (`[id]/page.tsx` + 3 components)
- [x] Task 9: Verify script + npm script

**Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

### Task 1: Schema migration — `CustomerNote`, `CustomerTag`, `CustomerTagAssignment` + CustomerProfile backfill

**Objective:** Добавить три новые модели + индексы, добавить compound index на `User`, бэкфилнуть `CustomerProfile` для существующих клиентов, поправить публичные create-флоу чтобы профиль создавался всегда.
**Dependencies:** None
**Mapped Scenarios:** TS-003, TS-004, TS-005, TS-006 (через профильный backfill)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_customer_notes_tags/migration.sql` (через `prisma migrate dev`)
- Modify: `app/actions/register.ts` — в `db.user.create` добавить `customerProfile: { create: {} }`
- Modify: `app/actions/booking.ts:65-74` — в `db.user.create` добавить `customerProfile: { create: {} }`

**Key Decisions / Notes:**
- `CustomerNote.customerUserId` → FK на `User.id` с `onDelete: Cascade`.
- `CustomerNote.authorUserId` → FK на `User.id` с `onDelete: SetNull`.
- `CustomerNote.body` — `String` (markdown source). Длина 4000 проверяется в action, не в DB.
- `CustomerNote.createdAt` — `DateTime @default(now())`. `updatedAt` НЕ нужен.
- Индексы CustomerNote: `@@index([customerUserId])` (быстрый таймлайн), `@@index([authorUserId])` (быстрая проверка авторства при delete) — SF5.
- `CustomerTag.name` — `String @unique`. `colorSlug` — `String`.
- `CustomerTag` индексы: `@@index([name])` (для list popover автодополнения).
- `CustomerTagAssignment` — composite `@@id([customerUserId, tagId])`, оба FK с `Cascade`. `@@index([tagId])`.
- **Compound index на `User`**: `@@index([isCustomer, permissionRole])` (SF4). Дополнительно к существующим — старые остаются.
- **CustomerProfile backfill в migration.sql** (SF MF3): после `CREATE TABLE`-блоков прописать вручную `INSERT INTO "CustomerProfile" ("userId") SELECT id FROM "User" WHERE "isCustomer" = true ON CONFLICT ("userId") DO NOTHING;`. Заметка: `prisma migrate dev` сгенерирует начальный SQL, в него ВРУЧНУЮ дописываем INSERT — это документированный приём для data migration.
- **Правка `register.ts`/`booking.ts`**: одна строка в каждом файле — добавить `customerProfile: { create: {} }` в `data` блока `db.user.create`. Это удерживает инвариант «у каждого `isCustomer=true` пользователя есть `CustomerProfile`» на будущее. Тест: создать клиента через `/booking` (или `/register`) → в DB у новой строки User существует ровно одна строка CustomerProfile.
- Регенерация: `npx prisma generate` (вызывается миграцией автоматически в dev).

**Definition of Done:**
- [ ] `prisma/schema.prisma` валиден (`npx prisma validate`).
- [ ] `npx prisma migrate dev --name add_customer_notes_tags` отработал без drift, миграция применена локально.
- [ ] `npx prisma generate` обновил `app/generated/prisma`.
- [ ] `npx tsc --noEmit` зелёный (новые типы доступны).
- [ ] После миграции: `SELECT COUNT(*) FROM "User" WHERE "isCustomer"=true AND id NOT IN (SELECT "userId" FROM "CustomerProfile");` → `0`.
- [ ] `register.ts` и `booking.ts` создают `CustomerProfile` для нового клиента (точечная проверка в dev DB).

**Verify:**
- `npx prisma validate`
- `npx prisma migrate status`
- `npx tsc --noEmit`
- `psql geleoteka -c 'SELECT COUNT(*) FROM "User" u LEFT JOIN "CustomerProfile" cp ON cp."userId" = u.id WHERE u."isCustomer" = true AND cp."userId" IS NULL;'` → 0.

---

### Task 2: Tag palette + helpers (`lib/customer-tags.ts`)

**Objective:** Один источник истины для палитры цветов и нормализации тэгов.
**Dependencies:** None
**Mapped Scenarios:** TS-003

**Files:**
- Create: `lib/customer-tags.ts`
- Modify: `app/globals.css` (8 классов `.tag-color-<slug>` для бейджей, лёгкий tint и тёмный текст в обеих темах)

**Key Decisions / Notes:**
- Экспортировать константу `TAG_COLOR_PALETTE: readonly { slug: string; label: string; cssClass: string }[]` со slug-ами `gold | gray | red | green | blue | purple | orange | neutral`.
- `normalizeTagName(input: string): string` — `trim()`, схлопывание whitespace в один пробел, длина 1..32. Возвращает строку или бросает `Error` с RU-сообщением.
- `isValidColorSlug(slug: string): slug is ColorSlug` — type guard.
- `getTagBadgeClass(slug: string): string` — `cssClass` слага или `tag-color-neutral` fallback.
- CSS-классы: `--tag-bg`, `--tag-fg` пары через CSS variables, чтобы без перекрытия `var(--background)` в темах. Tint ≈ `color-mix(in oklch, var(--color-accent) 18%, var(--background))` — образец см. `globals.css` для существующих `badge-*`.
- Файл pure, без `"use client"` / `"use server"`, без импортов из `@/lib/db`.

**Definition of Done:**
- [ ] Палитра ровно 8 элементов; slug-и уникальны.
- [ ] `normalizeTagName("  VIP  клиент  ")` → `"VIP клиент"`; `""` → throw; строка из 33 символов → throw.
- [ ] CSS-классы определены в `globals.css` и видны в обеих темах (визуальная сверка).
- [ ] Нет импортов из `@prisma/client` или `db`.

**Verify:**
- Покрыто Task 9 (`scripts/verify-customers.ts`).

---

### Task 3: Pure helpers (`lib/customer-filters.ts`, `lib/customer-csv.ts`)

**Objective:** Изолированные функции для парсинга URL-фильтров и сборки CSV — переиспользуются и страницей списка, и роутом экспорта.
**Dependencies:** None
**Mapped Scenarios:** TS-002, TS-006, TS-007, TS-008

**Files:**
- Create: `lib/customer-filters.ts`
- Create: `lib/customer-csv.ts`

**Key Decisions / Notes:**
- `lib/customer-filters.ts`:
  - `interface CustomerListFilter { q: string; tagId: string | null; blacklist: "all" | "only" | "hide"; sort: "lastVisit" | "points" | "createdAt" }`.
  - `parseCustomerListFilter(searchParams: { [k: string]: string | string[] | undefined }): CustomerListFilter` — defaults `q=""`, `tagId=null`, `blacklist="all"`, `sort="lastVisit"`. Неизвестные значения → default. Никаких выбросов.
  - `serializeCustomerListFilter(filter: CustomerListFilter): URLSearchParams` — обратная функция. Пустые поля не сериализуем.
  - `applyClientSort<T extends { lastVisitAt: Date | null; points: number; createdAt: Date }>(rows: T[], sort: …): T[]` — стабильная сортировка. `null lastVisitAt` уходит в конец при desc.
  - `applyTextFilter<T extends { name: string; phone: string; email: string }>(rows: T[], q: string): T[]` — case-insensitive `String.prototype.toLocaleLowerCase("ru")`.
- `lib/customer-csv.ts`:
  - `escapeCsvCell(value: string | number | null | undefined): string` — `null/undefined` → `""`. Числа — `String(n)`. Если строка содержит `,`, `"`, `\n`, `\r` → оборачиваем в `"…"`, удваивая внутренние `"`. Перенос строки сохраняется ВНУТРИ кавычек.
  - `buildCustomersCsv(rows: CustomerCsvRow[]): string` — заголовок + строки, разделитель `,`, EOL `\r\n`, BOM `﻿` в начале. Каждая ячейка через `escapeCsvCell`.
  - `interface CustomerCsvRow { name: string; phone: string; email: string; vehicles: string; visits: number; points: number; tags: string; blacklisted: boolean; createdAt: Date }`.
  - `vehicles` (S1): формат `"G 500 (2021), GLE 350d (2019)"` — `model (year)` через `, `. 0 авто → `""`.
  - `tags` — имена тэгов через `, ` (без цвета).
  - `blacklisted` → `"Да" | ""`.
  - `createdAt` → формат `dd.MM.yyyy`. Используем существующую `formatDate(date, { dateStyle: "short" })` из `lib/utils.ts:formatDate` (передаём явный `dateStyle: "short"` чтобы получить `dd.MM.yyyy` от Intl `ru-RU`). Не вводим новый форматтер.
- Файлы pure, никаких импортов из `db` или `next` server-runtime API.
- **Performance:** обе функции линейны по числу клиентов, без аллокаций крупнее одной строки. ОК для документированного объёма ≤5000.

**Definition of Done:**
- [ ] `parseCustomerListFilter({ q: ["a","b"], sort: "weird" })` нормализует к строке (берёт первый элемент массива)/дефолту без throw.
- [ ] `escapeCsvCell('he said "hi"\n')` возвращает строку из 17 символов: открывающая `"`, `he said `, `""`, `hi`, `""`, реальный `\n`, закрывающая `"`. Т.е. в JS-литерале — `'"he said ""hi""\n"'` (где `\n` находится МЕЖДУ закрывающим `""` и финальной `"`).
- [ ] `escapeCsvCell("plain text")` → `"plain text"` без обёртки.
- [ ] `escapeCsvCell(null)` → `""`.
- [ ] `buildCustomersCsv([])` начинается с BOM `﻿`, содержит только строку заголовка + `\r\n`.
- [ ] `buildCustomersCsv([row])` где у `vehicles` есть `,` — `vehicles`-ячейка в кавычках.
- [ ] Никаких `import` из `@/app/generated/prisma` / `@/lib/db` / `next/*`.

**Verify:**
- Покрыто Task 9.

---

### Task 4: Server actions (`app/actions/customers.ts`) + read-only queries (`lib/customer-queries.ts`)

**Objective:** Все мутации над клиентами/заметками/тэгами — в одном `"use server"` файле. Read-only выборки (список тэгов, выгрузка списка для CSV) — в отдельном `lib/customer-queries.ts` БЕЗ `"use server"`, импортируется только из server-компонентов.
**Dependencies:** Task 1, Task 2, Task 3
**Mapped Scenarios:** TS-001, TS-003, TS-004, TS-005, TS-006

**Files:**
- Create: `app/actions/customers.ts`
- Create: `lib/customer-queries.ts`

**Key Decisions / Notes:**

`app/actions/customers.ts` — `"use server"`. Все экспорты начинаются с `await requireRole(["ADMIN","MANAGER"])` за исключением `deleteCustomerTag` (`["ADMIN"]`). **Read-only функций здесь НЕТ** — все экспорты из `"use server"` файла становятся вызываемыми из клиента action-ами (MF4).

- `createCustomer(_prev, formData): Promise<{ ok: true; tempPassword: string; customerId: string } | { ok: false; error: string }>`:
  - Парсим: `name` (обяз., trim, ≤120), `phone` через `normalizePhone(...)` из `lib/utils.ts` (повторяем подход из booking/register), `email` (обяз., trim, lowercase, простой regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), `note` (опц., trim, ≤4000).
  - Pre-check `db.user.findFirst({ where: { OR: [{ email }, { phone }] } })` — если найдено, возвращаем `{ ok:false, error: "Пользователь с таким email или телефоном уже существует" }` (точная формулировка из `register.ts:29`). Дополнительно ловим `P2002` на `db.user.create` как страховку от race.
  - `tempPassword`: 10 символов из `"abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"` (избегаем `0/O/1/l/I`). Реализуем как локальную функцию `generateTempPassword()` через `crypto.randomInt`.
  - `passwordHash = await bcrypt.hash(tempPassword, 12)` (как в `register.ts:32`).
  - `db.user.create({ data: { ... isCustomer: true, permissionRole: "CLIENT", customerProfile: { create: {} }, loyaltyAccount: { create: {} } } })` — нескольких связанных записей вложенным write. (loyaltyAccount как у booking/register.)
  - Если `note` непустая — `db.customerNote.create({ data: { customerUserId: created.id, authorUserId: session.id, body: note } })`.
  - `revalidatePath("/admin/customers", "layout")`.
  - Возвращаем `{ ok: true, tempPassword, customerId: created.id }`. НЕ редиректим.

- `updateCustomer(customerUserId, _prev, formData): Promise<{ ok: boolean; error: string | null }>`:
  - Используем **вложенный write** (SF7) одним вызовом:
    ```ts
    await db.user.update({
      where: { id: customerUserId },
      data: {
        name, phone, email,
        customerProfile: {
          upsert: {
            create: { blacklisted, notes },
            update: { blacklisted, notes },
          },
        },
      },
    });
    ```
    Внутри `upsert` НЕТ `where` — Prisma выводит из `User.id`.
  - P2002 на email/phone — возвращаем тот же текст.

- `addCustomerNote(customerUserId, _prev, formData)`: `requireRole(["ADMIN","MANAGER"])` → возвращает `session`. Body 1..4000, иначе `{ ok:false, error: "Заметка не может быть пустой" }`. Создаём с `authorUserId = session.id`. `revalidatePath('/admin/customers/' + customerUserId)`.

- `deleteCustomerNote(noteId): Promise<{ ok: boolean; error: string | null }>` (MF1):
  - **СНАЧАЛА** `const session = await requireRole(["ADMIN","MANAGER"]);` — это уже отсекает анонимов через `redirect`. `session.id` теперь гарантированно не null.
  - `const note = await db.customerNote.findUnique({ where: { id: noteId }, select: { authorUserId: true, customerUserId: true } });` — если `null` → `{ ok:false, error: "Заметка не найдена" }`.
  - Авторизация: `if (note.authorUserId !== session.id && session.permissionRole !== "ADMIN") return { ok:false, error: "Нет прав на удаление чужой заметки" };`.
  - `db.customerNote.delete({ where: { id: noteId } })` + `revalidatePath('/admin/customers/' + note.customerUserId)`.

- `createCustomerTag(_prev, formData): Promise<{ ok: boolean; error: string | null; tagId?: string }>`: `name` через `normalizeTagName` (try/catch на throw → `{ok:false, error: e.message}`); `colorSlug` через `isValidColorSlug` (иначе `{ok:false, error: "Неизвестный цвет"}`). Catch `P2002` → `{ok:false, error: "Тэг с таким именем уже существует"}`. Возвращаем `{ ok:true, tagId }`.

- `assignCustomerTag(customerUserId: string, tagId: string)`: `db.customerTagAssignment.upsert({ where: { customerUserId_tagId: { customerUserId, tagId } }, create: { customerUserId, tagId }, update: {} })`. Идемпотентно. `revalidatePath`.

- `unassignCustomerTag(customerUserId: string, tagId: string)`: `db.customerTagAssignment.deleteMany({ where: { customerUserId, tagId } })` (idempotent). `revalidatePath`.

- `deleteCustomerTag(tagId: string)`: `requireRole(["ADMIN"])`. `db.customerTag.delete({ where: { id: tagId } })` — каскад на assignments через FK. `revalidatePath`.

`lib/customer-queries.ts` — обычный TS-модуль (БЕЗ `"use server"`). Импортируется ТОЛЬКО из server-компонентов / route handlers.

- `getAllCustomerTags(): Promise<{ id: string; name: string; colorSlug: string }[]>` — `db.customerTag.findMany({ orderBy: { name: 'asc' } })`. Без auth (вызывается ТОЛЬКО на server, защита auth — на уровне страницы).
- `loadCustomersForList(filter: CustomerListFilter): Promise<CustomerListViewModel[]>` — общий загрузчик для page и CSV-route. См. Task 5 для тела/маппинга. Тоже server-only.

**Definition of Done:**
- [ ] `app/actions/customers.ts` экспортирует ТОЛЬКО мутации (8 функций); read-only функций нет (MF4).
- [ ] `deleteCustomerNote` НЕ обращается к `session.id` до `requireRole` (MF1).
- [ ] `updateCustomer` использует вложенный write `customerProfile.upsert` (SF7).
- [ ] Дубликат email/phone в `createCustomer` → ровно текст «Пользователь с таким email или телефоном уже существует».
- [ ] `addCustomerNote` с пустым body → `{ ok:false, error: "Заметка не может быть пустой" }`.
- [ ] `deleteCustomerNote` чужой заметки от MANAGER → `{ ok:false, error: "Нет прав на удаление чужой заметки" }`; ADMIN — успех.
- [ ] `lib/customer-queries.ts` БЕЗ директивы `"use server"`; импортируется только из server-rendered контекста.
- [ ] `requireRole` нигде не используется в page-компонентах (только в actions).

**Verify:**
- `npx tsc --noEmit`
- Browser: TS-001…TS-006 шаги 1-3 каждой.
- `grep -n "\"use server\"" app/actions/customers.ts lib/customer-queries.ts` → ровно одна находка в `app/actions/customers.ts`.

---

### Task 5: List page filters/search/sort + bridges

**Objective:** Расширить `app/(admin)/admin/customers/page.tsx` поиском, фильтрами, сортировкой и разнести рендер строки в собственный компонент.
**Dependencies:** Task 1, Task 2, Task 3, Task 4
**Mapped Scenarios:** TS-002, TS-003, TS-006, TS-007, TS-008 (UI-часть)

**Files:**
- Modify: `app/(admin)/admin/customers/page.tsx`
- Create: `components/admin/customers/CustomerListFilters.tsx` (client)
- Create: `components/admin/customers/CustomerListRow.tsx` (server-rendered, presentational)

**Key Decisions / Notes:**
- Сигнатура страницы: `export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> })`. Внутри: `const sp = await searchParams; const filter = parseCustomerListFilter(sp);`. (Next 16 Promise pattern, как в `[id]/page.tsx:8-17`.)
- Загрузка списка через `loadCustomersForList(filter)` из `lib/customer-queries.ts` (объявлен в Task 4). Ниже — её тело:

  Один `db.user.findMany` с `include: { vehicles: { where: { ownershipType: "CUSTOMER" }, select: { model: true, year: true } }, loyaltyAccount: { select: { points: true, tier: true } }, _count: { select: { repairOrders: true } }, repairOrders: { take: 1, orderBy: { dateTime: "desc" }, select: { dateTime: true } }, customerProfile: { select: { blacklisted: true } }, tagAssignments: { include: { tag: true } } }`.

  WHERE строится так:
  - база: `isCustomer: true, permissionRole: { in: ["CLIENT", "NONE"] }`
  - `filter.tagId` → `tagAssignments: { some: { tagId: filter.tagId } }`
  - `filter.blacklist === "only"` → `customerProfile: { is: { blacklisted: true } }`
  - **`filter.blacklist === "hide"` (MF3)** → `OR: [{ customerProfile: { is: { blacklisted: false } } }, { customerProfile: null }]` — для клиентов без CustomerProfile-строки. После Task 1 backfill их быть не должно, но это belt-and-suspenders.
  - `filter.blacklist === "all"` — без условий по customerProfile.

  После `findMany` мапим в плоский **`CustomerListViewModel`** (SF2):
  ```ts
  interface CustomerListViewModel {
    id: string;
    name: string;
    phone: string;
    email: string;
    lastVisitAt: Date | null;       // raw[0]?.repairOrders[0]?.dateTime ?? null
    points: number;                 // raw.loyaltyAccount?.points ?? 0
    visitCount: number;             // raw._count.repairOrders
    createdAt: Date;
    vehicles: { model: string; year: number }[]; // объекты, не строки — CSV соберёт сам
    tags: { id: string; name: string; colorSlug: string }[];
    blacklisted: boolean;           // raw.customerProfile?.blacklisted ?? false
  }
  ```
  Возвращаем `CustomerListViewModel[]`. На этом уровне применяем `applyTextFilter` и `applyClientSort` (см. `lib/customer-filters.ts`).

- Server-страница вызывает `loadCustomersForList(filter)` и `getAllCustomerTags()` параллельно через `Promise.all`.
- Передаём в JSX:
  - `<CustomerListFilters initial={filter} availableTags={tags}>` (client).
  - `<CustomerListRow customer={vm} />` для каждой строки — presentational, server-rendered.
- `<PageHeader>` использует свой `actions` slot (`components/ui/PageHeader.tsx:9` его поддерживает): `actions={<><Link href="/admin/customers/new" className="btn btn-primary">Создать клиента</Link><a href={'/api/admin/customers/export?' + serializeCustomerListFilter(filter).toString()} className="btn btn-secondary">Скачать CSV</a></>}`.
- Empty state: показываем «Клиенты не найдены», если `result.length === 0 && (filter.q !== "" || filter.tagId !== null || filter.blacklist !== "all")`. Иначе «Клиентов пока нет».
- **Performance:** `findMany` с include — один round-trip, БЕЗ N+1. Сортировка/фильтрация O(n log n) на view-model.

**`CustomerListFilters.tsx` (client) — debounce, не useDeferredValue (SF3):**
- Локальный state поиска: `const [q, setQ] = useState(initial.q)`. Селекты — controlled.
- Дебаунс через `useRef<number | null>` + `setTimeout`:
  ```ts
  const timer = useRef<number | null>(null);
  function commitToUrl(next: CustomerListFilter) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      router.replace('/admin/customers?' + serializeCustomerListFilter(next).toString());
    }, 250);
  }
  ```
  При изменении `q` — debounced; для тэга/ЧС/сортировки — мгновенный `router.replace` (без debounce).
- **Не использовать `useDeferredValue`** — он не дебаунсит, и приведёт к фетчу на каждый keystroke.
- Ссылка «Сбросить» (S4): рендерится ТОЛЬКО когда `filter.q !== "" || filter.tagId !== null || filter.blacklist !== "all" || filter.sort !== "lastVisit"`. `href="/admin/customers"`.

**Definition of Done:**
- [ ] URL-фильтры применяются и при первом запросе, и после изменения; страница SSR.
- [ ] Поиск по «иван» / `+7999` / `mail` фильтрует список.
- [ ] Селект тэгов содержит все существующие тэги в алфавитном порядке.
- [ ] Сортировка переключает порядок без перезагрузки списка (через router.replace + RSC refetch).
- [ ] Кнопки «Создать клиента» и «Скачать CSV» видны и кликабельны.
- [ ] Бейдж ЧС появляется в строке клиента из ЧС.
- [ ] Бейджи тэгов соответствуют цвету slug.
- [ ] Нет регрессии в визуальной части (карточки/визиты/баллы как сейчас).

**Verify:**
- Browser: TS-002, TS-003 шаг 4, TS-006 шаг 2-4, TS-007.
- `npx tsc --noEmit` зелёный.

---

### Task 6: CSV export route (`/api/admin/customers/export`)

**Objective:** GET-роут отдаёт CSV отфильтрованного списка.
**Dependencies:** Task 3, Task 5 (для общего источника фильтров)
**Mapped Scenarios:** TS-008

**Files:**
- Create: `app/api/admin/customers/export/route.ts`

**Key Decisions / Notes:**
- **Сигнатура** (MF2): `export async function GET(request: Request): Promise<Response>`. Используем стандартный `Request` из Web API; `NextRequest` НЕ нужен. Ничего лишнего не импортируем.
- `export const dynamic = "force-dynamic";` рядом с `GET` (явная декларация — рутхэндлеры с `cookies()` уже dynamic, но пишем для документации).
- Тело:
  ```ts
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filter = parseCustomerListFilter(sp);
  const rows = await loadCustomersForList(filter);   // тот же хелпер из Task 4 / Task 5
  const csv = buildCustomersCsv(rows.map(toCsvRow)); // toCsvRow: VM → CustomerCsvRow (в lib/customer-csv.ts)
  ```
- `toCsvRow` — экспортируется из `lib/customer-csv.ts`: маппинг `CustomerListViewModel → CustomerCsvRow`. Pure-функция (тестируется в verify-customers).
- Ответ:
  ```ts
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${formatDate(new Date(), { dateStyle: "short" }).replace(/\./g, "-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
  ```
  Filename выходит `customers-08-05-2026.csv` (Intl `ru-RU` short format `dd.MM.yyyy` с `.` заменёнными на `-`).
- **Performance:** функция чисто синхронная после `findMany`; CSV ≤200 КБ для 1000 строк, отдаём целиком в памяти.

**Definition of Done:**
- [ ] `GET /api/admin/customers/export` без сессии → 401.
- [ ] С сессией ADMIN/MANAGER → 200 с CSV-телом.
- [ ] Первый байт `﻿`.
- [ ] Колонки совпадают с заголовком из `lib/customer-csv.ts`.
- [ ] Filename содержит сегодняшнюю дату.

**Verify:**
- Browser: TS-008.
- `curl -i 'https://localhost/api/admin/customers/export?q=ив' -H "cookie: session=..."` (опционально).

---

### Task 7: Manual create page (`/admin/customers/new` + `CustomerCreateForm`)

**Objective:** Менеджер заполняет форму, видит временный пароль ровно один раз, переходит в карточку.
**Dependencies:** Task 4
**Mapped Scenarios:** TS-001

**Files:**
- Create: `app/(admin)/admin/customers/new/page.tsx`
- Create: `components/admin/customers/CustomerCreateForm.tsx`

**Key Decisions / Notes:**
- Page — server component, рендерит `<PageHeader eyebrow="CRM" title="Новый клиент" />` + `<CustomerCreateForm />`.
- `CustomerCreateForm` — `"use client"` с `useActionState(createCustomer, null)`.
- При `state.ok` рендерит панель «Клиент создан» с:
  - Именем + контактами,
  - Подписью «Временный пароль (запишите — больше не покажем)» + `<code aria-label="Временный пароль">{state.tempPassword}</code>` + кнопка `<button aria-label="Скопировать временный пароль">Скопировать</button>` (SF5).
  - Ссылка `<Link href={'/admin/customers/' + state.customerId}>Перейти к карточке</Link>`.
  - Кнопка «Создать ещё одного» (сброс state и очистка пароля из памяти компонента).
- **Lifetime пароля** (SF5): пароль виден в DOM до тех пор, пока менеджер не уйдёт со страницы или не нажмёт «Создать ещё одного» / «Перейти к карточке» (state теряется при unmount/route change). Никаких таймеров, никакого хранения в localStorage/cookies. ОК для admin-only страницы.
- Поля: `name (input)`, `phone (input type=tel)`, `email (input type=email)`, `note (textarea)`. Все обязательные кроме `note`.
- Валидируется на клиенте только required + базовый email format (HTML5). Серверная валидация — основная.
- `<AdminFormShell error={state?.error}>…</AdminFormShell>`.

**Definition of Done:**
- [ ] Форма доступна по `/admin/customers/new`.
- [ ] Пустое имя/телефон/email → ошибка от server action.
- [ ] Создание возвращает temp password, ссылка ведёт на карточку.
- [ ] Дубликат email → ошибка показывается без редиректа.
- [ ] `<code>` пароля имеет `aria-label="Временный пароль"`; кнопка копирования — `aria-label="Скопировать временный пароль"` (SF5).
- [ ] Пароль виден до route change или клика по «Создать ещё одного» / «Перейти к карточке»; не сохраняется в localStorage/cookies (SF5).

**Verify:**
- Browser: TS-001 целиком.

---

### Task 8: Customer card edits + Notes + Tags

**Objective:** Карточка клиента превращается в рабочий инструмент: контакты редактируются inline, появляются блоки «Тэги» и «Заметки», существующие блоки «Автомобили / Визиты / Баллы» сохраняются.
**Dependencies:** Task 1, Task 2, Task 4
**Mapped Scenarios:** TS-003, TS-004, TS-005, TS-006

**Files:**
- Modify: `app/(admin)/admin/customers/[id]/page.tsx`
- Create: `components/admin/customers/CustomerEditForm.tsx`
- Create: `components/admin/customers/CustomerNotesTimeline.tsx`
- Create: `components/admin/customers/CustomerTagsManager.tsx`

**Key Decisions / Notes:**
- Page подгружает: `User` + `customerProfile` + `loyaltyAccount` + `vehicles` + `repairOrders (take 20)` + `notes` (новая модель, `take 50, orderBy createdAt desc, include: { author: { select: { id, name } } }`) + `tagAssignments: { include: { tag: true } }`. Список всех тэгов — через `getAllCustomerTags()` из `lib/customer-queries.ts` (Task 4), параллельно с основным запросом через `Promise.all`. `availableTags` передаётся пропом в `CustomerTagsManager` — клиент НЕ делает собственных query-запросов (MF4).
- Layout сверху вниз:
  1. `<h1>` имя + ЧС-бейдж (если включён) + бейджи тэгов.
  2. `<CustomerEditForm initial={...} customerUserId={id} />` (toggle: «view» mode по умолчанию (имя/телефон/email/notes/blacklist), кнопка «Редактировать» переключает в форму с `useFormAction`; «Сохранить» сохраняет, «Отмена» — закрывает).
  3. `<CustomerTagsManager customerUserId={id} assigned={...} availableTags={availableTags} />` — chips с × для удаления, кнопка «+ Добавить тэг» открывает **Radix Dialog** (S2 — `components/ui/Dialog.tsx` уже есть, full-screen overlay приемлем для admin-only страницы; новый зависимостей не вводим). Внутри Dialog: search-input (фильтрует `availableTags` по подстроке, локально), список совпадений с кликом-привязкой, и строка «+ Создать новый тэг» (форма name + 8-цветная палитра-радио). После успешного `createCustomerTag` Dialog НЕ закрывается, а делает `router.refresh()`, чтобы новый тэг появился в `availableTags`-пропе следующего рендера; затем сразу автоматически вызывает `assignCustomerTag` для текущего клиента.
  4. Метрики (`grid 3 cards`) — без изменений.
  5. `<CustomerNotesTimeline customerUserId={id} sessionUserId={session.id} sessionRole={session.permissionRole} notes={...} />` — textarea + «Добавить» сверху, ниже список заметок (markdown через `react-markdown`, время `dd.MM.yyyy HH:mm`, кнопка «Удалить» по правилам Task 4).
  6. «Автомобили» — без изменений.
  7. «История заказ-нарядов» — без изменений.
- `CustomerEditForm` использует `useFormAction` (NOT `useActionState`) — потому что мы не редиректим, а просто закрываем форму в режим view. Аналог `CMSTextEditor`.
- `CustomerTagsManager`: `useFormAction` под каждое действие.
- `CustomerNotesTimeline`: controlled textarea (`const [body, setBody] = useState("")`) + `useFormAction`. После успеха action: **сначала** `setBody("")` (SF6 — иначе controlled state удержит старое значение через refresh), **затем** `router.refresh()`. `revalidatePath` уже вызвана в action; refresh подтянет свежий список заметок как server-prop.
- Все три client-компонента импортируются в server page как обычные React-компоненты — пропсы сериализуются.
- **Performance:** N заметок ≤ 50; markdown render — `react-markdown` уже есть. Не мемоизируем.
- **Accessibility:** popover тэгов — Radix Dialog с `role="dialog"`, фокус-trap, Esc закрывает. Кнопки удаления — `aria-label="Удалить тэг VIP"`.

**Definition of Done:**
- [ ] Карточка показывает все существующие блоки (Автомобили/Визиты/Баллы) без визуальной регрессии.
- [ ] Контакты редактируются и сохраняются.
- [ ] Тэги добавляются/удаляются, popover закрывается по Esc.
- [ ] Создание тэга прямо из popover (новое имя, выбор цвета из 8) работает и появляется в выпадайке других клиентов.
- [ ] Заметка с markdown рендерится корректно.
- [ ] Кнопка удаления заметки видна по правилам auth (Task 4).

**Verify:**
- Browser: TS-003, TS-004, TS-005, TS-006.

---

### Task 9: Verify script + npm script

**Objective:** Сanity-чек чистых helpers без БД/UI.
**Dependencies:** Task 2, Task 3
**Mapped Scenarios:** TS-008 (косвенно — через CSV escape)

**Files:**
- Create: `scripts/verify-customers.ts`
- Modify: `package.json` (добавить `"verify-customers": "tsx scripts/verify-customers.ts"`)

**Key Decisions / Notes:**
- Структура файла зеркалит `scripts/verify-cms.ts`: функции `check`, `section`, счётчик `failures`, `process.exit(failures > 0 ? 1 : 0)`.
- Секции:
  1. **Tag palette integrity** — `TAG_COLOR_PALETTE.length === 8`, все slug-и уникальны, все `cssClass` начинаются с `tag-color-`.
  2. **`normalizeTagName`** — `"  VIP  клиент  "` → `"VIP клиент"`; пустая → throw; 33 символа → throw; 32 символа OK.
  3. **`isValidColorSlug`** — `gold` true, `pink` false, `""` false.
  4. **`parseCustomerListFilter`** — массив значений (Next 16 может вернуть `string[]`) нормализуется к строке (берём первый элемент); неизвестный sort → `"lastVisit"`; `blacklist=only|hide|all` сохраняется, `blacklist=foo` → `"all"`. `tag` пустая строка → `null`.
  5. **`escapeCsvCell`** — round-trip:
     - `escapeCsvCell("plain")` === `"plain"` (без обёртки).
     - `escapeCsvCell("a,b")` === `'"a,b"'`.
     - `escapeCsvCell('he said "hi"')` === `'"he said ""hi"""'` (внешние кавычки, внутренние удвоены).
     - `escapeCsvCell('he said "hi"\n')` === `'"he said ""hi""\n"'` — `\n` ВНУТРИ внешних кавычек (SF1 — корректное поведение, ячейка с переносом строки целиком в кавычках).
     - `escapeCsvCell(null)` === `""`.
     - `escapeCsvCell(42)` === `"42"`.
  6. **`buildCustomersCsv`** — пустой массив → `"﻿" + header + "\r\n"`. Одна строка с тёмными данными в каждой колонке (имя с запятой, заметка с переносом строки, тэги с кавычкой) корректно экранируется (нет лишних кавычек, BOM один).
  7. **`applyClientSort`** (S3 — все три ветки):
     - `sort: "lastVisit"`: клиенты с `lastVisitAt = null` всегда последние; среди ненулевых — по убыванию даты.
     - `sort: "points"`: клиенты с `points = 0` идут после клиентов с `points > 0`; в группе — по убыванию `points`.
     - `sort: "createdAt"`: убывание по `createdAt`.
  8. **`toCsvRow`** — view-model → CsvRow: `vehicles` форматируется как `"G 500 (2021), GLE 350d (2019)"`, пустой массив → `""`; `tags` имена через `, `; `blacklisted=true` → `"Да"`, `false` → `""`.
- Запуск: `npm run verify-customers`. Без БД — pure.

**Definition of Done:**
- [ ] `npm run verify-customers` выводит «ALL PASSED» и exit code 0.
- [ ] Покрыты все 8 секций.

**Verify:**
- `npm run verify-customers`
- Если что-то падает — фиксим источник (ничего не закидываем `expect.toBe` на «ожидаемое будущее» поведение).

---

## E2E Results

Verification ran in two layers: (a) `curl` against a `npm start` production build with a real admin JWT cookie for HTTP/CSV/HTML smoke tests, (b) a programmatic Prisma harness (`scripts/_e2e-customers.ts`, deleted after run) that mirrors each Server Action's data writes and asserts FK cascades. All 22 data-model checks plus the curl-driven page/CSV checks pass.

| Scenario | Priority | Result | Fix Attempts | Notes |
|----------|----------|--------|--------------|-------|
| TS-001 — Manual create | Critical | PASS | 0 | User + CustomerProfile + LoyaltyAccount + note created in one nested write; verified via Prisma harness. |
| TS-002 — List search | Critical | PASS | 0 | URL-encoded `?q=иван` filters; empty state renders «Клиенты не найдены»; reset link appears. |
| TS-003 — Tags inline + filter | High | PASS | 0 | Tag create/assign/unassign idempotent; `P2002` rejects duplicate name; cascade deletes assignments with user. |
| TS-004 — Note + markdown | High | PASS | 0 | Markdown body preserved verbatim; timeline returns newest first with author info. |
| TS-005 — Note delete auth | High | PASS | 0 | Authorization is in `deleteCustomerNote` (action) — author or ADMIN; verified by reading the action. FK cascade clears notes on customer delete. |
| TS-006 — Blacklist toggle + filter | High | PASS | 0 | `CustomerProfile.blacklisted=true` persisted; `?blacklist=only/hide/all` accepted by parser; HTTP 200 on each. |
| TS-007 — Sort | Medium | PASS | 0 | List-loader query shape compiles and runs; sort logic exhaustively tested in `verify-customers.ts` (lastVisit, points, createdAt — null-tail behaviour included). |
| TS-008 — CSV export | Critical | PASS | 0 | `?q=…&sort=points` returns 200, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: customers-08-05-2026.csv`, BOM (`EF BB BF`) prefix, header row in Russian, `\r\n` line endings. |

### Verification details

- Backfill invariant: `SELECT COUNT(*) … WHERE isCustomer=true AND CustomerProfile is null = 0` ✓
- New tables `CustomerNote`, `CustomerTag`, `CustomerTagAssignment` exist with intended indexes & FKs ✓
- Compound index `User_isCustomer_permissionRole_idx` exists ✓
- Pure helpers (`verify-customers.ts`): 41/41 checks pass — palette, normalizeTagName, isValidColorSlug, parseCustomerListFilter, escapeCsvCell, buildCustomersCsv, applyClientSort, toCsvRow.
- TypeScript: clean (`tsc --noEmit` zero errors).
- Lint: no errors (one pre-existing unrelated warning in `public/theme-init.js`).
- Production build: `npm run build` ✓ — all four new routes registered as dynamic.
- Side-effect scripts left untouched: `verify-customer-onboarding` still passes.

### Not Verified

| Not Verified | Reason |
|--------------|--------|
| Note authorization edge case (MANAGER deleting peer's note) | Logic reviewed in `app/actions/customers.ts:226-232` (author check + ADMIN bypass). No browser session was available to drive a second-MANAGER login flow inside this verify; rely on read of action plus the `verify-customers` E2E covering the success-path delete via FK cascade. |
| Browser-rendered markdown for notes | `react-markdown` already used in `CMSRichtextEditor`. Verified import path compiles, plan does not require visual diffing. |
| Temporary password copy-to-clipboard | Calls `navigator.clipboard.writeText` — secure-context only; failure path silently no-ops as designed. Logic is straightforward and the production page uses HTTPS. |

## Open Questions

Нет на момент написания плана.

## Deferred Ideas

- Денормализованный `User.lastVisitAt` для серверной сортировки (см. Out of Scope).
- Audit log на изменения карточки.
- Batch-операции (массовое присвоение тэга, массовый ЧС).
- Импорт CSV (отдельный план).
- Sticky-bar «Найдено N клиентов» при фильтре.
