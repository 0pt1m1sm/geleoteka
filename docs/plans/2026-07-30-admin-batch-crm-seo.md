# Админ-панель: пачка фиксов + фич (CRM, календарь, доступы, SEO)

Created: 2026-07-30
Status: IN_PROGRESS
Mode: auto
Iterations: 0
Type: Feature+Bugfix
Engine: ultraralph (durable plan-as-ledger)

## Summary

Семь стори по админ-панели Geleoteka: закрыть баг невидимой почты (soft-deleted клиенты),
дать редактирование календаря, управление записями, удаление пользователей, страницу ролей,
редактирование команды и SEO-оптимизацию публичного сайта.

Прод живой (geleoteka.ru, реальный бизнес) — каждую стори верифицировать в браузере, не только билд.

## Конвенции (обязательно)

- Next.js 16.2.3 App Router + Turbopack — **модифицированный** Next: перед кодом читать `node_modules/next/dist/docs`.
- Prisma-клиент из `@/app/generated/prisma/client` (НЕ `@prisma/client`); db-синглтон `@/lib/db`.
- Типы теряются через `db`-синглтон → явные type-assertions (`.claude/rules/geleoteka-conventions.md`).
- Auth: в page-компонентах **только** `getSession()` + `redirect()`; `requireRole()` кидает — годится в server actions.
- Мутации — server actions в `app/actions/*.ts` (`"use server"`), затем `revalidatePath`.
- Стили — CSS-переменные/классы из `globals.css`, без хардкод-hex. Бренд «Geleoteka».
- Новый пункт меню = запись в `lib/admin-nav.ts` (единый источник правды, компоненты не трогать).

## Progress Tracking

- [ ] Story 0: Почта soft-deleted клиентов не пропадает из UI   (Status: PENDING)
- [ ] Story 1: Редактирование календаря (часы, блокировки, праздники)   (Status: PENDING)
- [ ] Story 2: Управление записью — перенос времени + баг concern/notes   (Status: PENDING)
- [ ] Story 3: Удаление пользователей на /admin/users   (Status: PENDING, GATED — high risk)
- [ ] Story 4: Страница управления ролями в разделе «Доступы»   (Status: PENDING, GATED — high risk)
- [ ] Story 5: Редактирование команды /admin/team   (Status: PENDING)
- [ ] Story 6: SEO-оптимизация публичного сайта   (Status: PENDING)

## Implementation Tasks

### Story 0: Почта soft-deleted клиентов не пропадает из UI

**Objective:** письма, резолвящиеся на удалённого (soft-deleted) клиента, не должны исчезать из
интерфейса. Сейчас `User.deletedAt` не учитывается в резолве → письмо привязывается к
`CommunicationLog` удалённого клиента, в триаж `/admin/crm/inbox` не попадает (там только
`InboxMessage`), карточка удалённого клиента недоступна → письмо невидимо.

**Evidence (найдено при разборе прод-инцидента 2026-07-30):** `lib/email/resolve.ts`
`matchCustomerByEmail` (~L243) фильтрует только `isCustomer: true`, без `deletedAt`.
Те же ворота у `findThreadOwner` (~L211) и `matchRecipientCustomerIds` (~L263).

**Files:**
- Modify: `lib/email/resolve.ts` — исключить soft-deleted в `matchCustomerByEmail`,
  `findThreadOwner`, `matchRecipientCustomerIds`.
- Modify: `tests/email/mail-resolution.test.ts` — RED-тесты на все три пути.

**Key decisions:**
- Удалённый клиент = `deletedAt != null` → письмо падает в `InboxMessage(PENDING)` (триаж), а не в
  невидимый лог. Менеджер сам решит, к кому привязать.
- Тред-матч: если тред ведёт на удалённого клиента — тоже в триаж (иначе та же чёрная дыра).
- Follow-up задачу на удалённого клиента не создавать.

**DoD:**
- [ ] Входящее от soft-deleted клиента → `InboxMessage(PENDING)`, видно в `/admin/crm/inbox`.
- [ ] Тред-матч на удалённого клиента → триаж, не скрытый лог.
- [ ] Исходящее с получателем-удалённым → триаж (не «один известный получатель»).
- [ ] Живой клиент резолвится как раньше (регрессия закрыта).
- [ ] Verify: `npx vitest run tests/email` (99+ зелёных) + `npm run build`.

### Story 1: Редактирование календаря (часы, блокировки, праздники)

**Objective:** `/admin/calendar` сейчас read-only агенда. Дать: блокировать/разблокировать
интервалы, менять рабочие часы, дни-исключения, праздники — не сломав выдачу слотов.

**Evidence:** рабочие часы **захардкожены** — `lib/booking-slots.ts` `WORK_HOURS = ["09:00","11:00","13:00","15:00","17:00"]`, `SLOT_HOURS = 2`.
Моделей `WorkingHours`/`BlockedTime`/`Holiday` в схеме **НЕТ**. Единственная таблица доступности —
`Slot` (booking-lock: `dateTime @unique`, `repairOrderId @unique` NOT NULL — блокировку выразить нечем).
`/admin/calendar` — `app/(admin)/admin/calendar/page.tsx` + `components/admin/AdminCalendar.tsx` (нет мутаций).
Выдача слотов — `app/api/slots/route.ts` (нет проверок выходных/праздников: любой будущий день = 5 слотов).

**Files:**
- Modify: `prisma/schema.prisma` + Create: миграция — модели рабочих часов / блокировок / праздников.
- Create: `app/actions/schedule.ts` — server actions (ADMIN/MANAGER).
- Modify: `app/api/slots/route.ts` — учитывать часы/блокировки/праздники, **сохранив контракт ответа** `{ time, available }[]`.
- Modify: `lib/booking-slots.ts` — часы из БД вместо хардкода (fallback оставить безопасным).
- Modify: `app/(admin)/admin/calendar/page.tsx`, `components/admin/AdminCalendar.tsx` — UI редактирования.

**Инварианты, которые НЕЛЬЗЯ сломать:**
- `Slot.dateTime @unique` — единственная защита от двойной брони (транзакция `app/actions/booking.ts` L125-155). Не ослаблять.
- Контракт `/api/slots` — его читает `components/booking/CalendarSlotPicker.tsx`; его fallback «всё доступно» при ошибке станет неверным после переезда часов в БД — поправить.
- Освобождение слота при отмене — `app/actions/admin.ts` L47 `slot.deleteMany({ repairOrderId })`; блокировки не должны попадать под раздачу.
- ⚠️ Известная хрупкость: `/api/slots` считает часы по **серверному** времени (`getHours()`), а `lib/timezone.ts` объявляет `BUSINESS_TZ = "Europe/Moscow"`. Выбрать единую конвенцию, не плодить рассинхрон.
- Однобоксовая модель (один заказ на `dateTime`) — многопостовость вне скоупа.

**DoD:**
- [ ] Админ меняет рабочие часы → выдача слотов меняется соответственно.
- [ ] Админ блокирует интервал → слот исчезает из записи, существующие брони целы.
- [ ] Праздник/выходной → день без слотов.
- [ ] Двойная бронь по-прежнему невозможна (тест на гонку/уникальность).
- [ ] Verify: тесты слот-логики + `npm run build` + браузер (админ-календарь и клиентская запись).

### Story 2: Управление записью — перенос времени + баг concern/notes

**Objective:** (a) дать принудительный перенос времени записи (клиент позвонил); (b) починить баг:
текст клиента попадает в «Заметки мастера» вместо «Жалоба клиента».

**Evidence (баг):** `app/actions/booking.ts:139` — `notes: notes || null`. Текст из визарда
(`components/booking/Step3ContactConfirm.tsx` L155-164, «Опишите проблему или пожелания…») уходит в
`RepairOrder.notes` (поле мастера, `prisma/schema.prisma:669`), а не в `concern`
(`schema.prisma:668`, «Customer's words: what's wrong»). В админ-форме
`components/admin/RepairOrderDetailsForm.tsx`: `concern` = «Жалоба клиента» (L45-51), `notes` = «Заметки мастера» (L53-59).
**Фикс:** `concern: notes || null` на L139. `createDeal(... notes)` на L123 — отдельное поле `Deal.notes`, не трогать.

**Evidence (перенос):** `dateTime` (`schema.prisma:665`) ставится один раз при создании и **никогда** не меняется —
ни в `updateRepairOrderDetails` (`app/actions/admin.ts` L208-261), ни где-либо ещё. Зеркалится в `Slot.dateTime @unique`.

**Files:**
- Modify: `app/actions/booking.ts` (L139 — баг).
- Modify: `app/actions/admin.ts` — новый action переноса: `$transaction` на `repairOrder.update({dateTime})` + `slot.update({ where:{repairOrderId} })`, ловить unique-коллизию.
- Modify: `app/(admin)/admin/repair-orders/[id]/page.tsx` + `components/admin/RepairOrderDetailsForm.tsx` — контрол `datetime-local` (по образцу `promisedAt`).

**Key decisions:**
- Персонал вправе обойти сетку `WORK_HOURS` (звонок клиента), но **не** уникальность `Slot.dateTime` — коллизию показывать сообщением как в `booking.ts` L234-235.
- Баг-фикс **не** мигрирует старые записи (данные прошлых броней остаются в `notes`) — если нужен бэкфилл, отдельным решением.

**DoD:**
- [ ] Новая запись из визарда: текст клиента → «Жалоба клиента», «Заметки мастера» пусты.
- [ ] Перенос времени меняет и `RepairOrder.dateTime`, и `Slot` атомарно.
- [ ] Перенос на занятое время → внятная ошибка, ничего не изменилось.
- [ ] Verify: тесты + `npm run build` + браузер на реальной записи.

### Story 3: Удаление пользователей на /admin/users  ⚠️ GATED (high risk: auth/данные)

**Objective:** дать удаление пользователей (сейчас его нет вообще).

**Evidence:** `/admin/users` (`app/(admin)/admin/users/page.tsx`) — список без действий;
`components/admin/UserAdminActions.tsx` умеет только сброс пароля / смену роли / блокировку.
Единственный delete — `app/actions/crm/customers.ts` `deleteCustomer` (L20-60), доступен лишь из карточки CRM.
Паттерн: **soft-delete** `User.deletedAt` для реальных аккаунтов; hard delete только при `isTempPassword === true` (гостевые).
Гварды для образца — `changeUserRole` (`app/actions/user-management.ts` L139-182): ADMIN-only, last-admin, self.

**Files:**
- Modify: `app/actions/user-management.ts` — action удаления (soft-delete + restore).
- Modify: `components/admin/UserAdminActions.tsx` и/или `app/(admin)/admin/users/[id]/page.tsx` — контрол.

**Key decisions:**
- Soft-delete (`deletedAt`), чтобы история заказов/сделок не осыпалась; hard delete — только гостевые (`isTempPassword`).
- Гварды: нельзя удалить себя; нельзя удалить последнего ADMIN; ADMIN-only.
- Согласовать со Story 0: удалённый клиент → его почта идёт в триаж.

**DoD:**
- [ ] ADMIN удаляет пользователя → `deletedAt` проставлен, вход запрещён, история цела.
- [ ] Себя / последнего ADMIN удалить нельзя (тесты).
- [ ] MANAGER удалять не может.
- [ ] Восстановление работает.
- [ ] Verify: тесты гвардов + `npm run build` + браузер.

### Story 4: Страница управления ролями в разделе «Доступы»  ⚠️ GATED (high risk: auth)

**Objective:** отдельная страница управления ролями пользователей в разделе «Доступы».

**Evidence:** раздел **«Доступы» уже существует** — `lib/admin-nav.ts` группа `admin-group-iam` (L89-96)
с единственным пунктом `/admin/users` «Пользователи». Смена роли — `changeUserRole`
(`app/actions/user-management.ts` L139-182, ADMIN-only, гварды last-admin/self).
`ALLOWED_ROLES = ["NONE","CLIENT","MANAGER","ADMIN"]` — **уже** и́сключает `MASTER` и `WAREHOUSE_WORKER`,
хотя в enum `UserPermissionRole` (`schema.prisma` L15-22) они есть.

**Files:**
- Create: `app/(admin)/admin/roles/**` — страница ролей.
- Modify: `lib/admin-nav.ts` — пункт «Роли» в группу `admin-group-iam`.
- Modify (при необходимости): `app/actions/user-management.ts`.

**Key decisions / открытый вопрос:**
- Решить, показывать ли `MASTER`/`WAREHOUSE_WORKER` в списке назначаемых ролей (сейчас `ALLOWED_ROLES` их не пускает,
  а enum — содержит). Расширение списка = расширение поверхности доступа → обосновать в гейте.
- Матрица «роль → что доступно» берётся из `filterNavForRole` + page-level `requireRole`.

**DoD:**
- [ ] Страница «Роли» доступна из «Доступы», ADMIN-only.
- [ ] Смена роли работает, гварды (last-admin, self) соблюдены.
- [ ] MANAGER не имеет доступа к странице.
- [ ] Verify: тесты + `npm run build` + браузер.

### Story 5: Редактирование команды /admin/team

**Objective:** дать редактирование команды (сейчас read-only).

**Evidence — важно:** команда это **данные, а не контент**: `User(isMaster=true)` + 1:1 `MasterProfile`
(`schema.prisma` L527-541: `specialty`, `yearsExperience`, `bio`, `photoUrl`, `certifications[]`, `isActive`, `sortOrder`).
Модели `TeamMember` нет. `/admin/team` (`app/(admin)/admin/team/page.tsx`) только читает; **ни одного write-action
для `MasterProfile` в проекте нет** (greenfield). Публичный вывод — `app/(public)/about/page.tsx`
(фильтр `isActive`, сортировка `sortOrder`); из CMS берётся **только заголовок секции** (`getCMSText("about.team.title")`).
`user-management.ts` уже ревалидирует `/admin/team/${userId}` — маршрута пока не существует.

**Решение по размещению:** редактирование остаётся в «Сервис» → «Команда» (это доменные данные),
в раздел «Сайт» (CMS-контент: `/admin/cms`, `/admin/vacancies`) **не** переносим.

**Files:**
- Create: `app/actions/team.ts` — upsert `MasterProfile`, тоггл `User.isMaster`, `isActive`, `sortOrder`.
- Create: `app/(admin)/admin/team/[id]/**` — страница редактирования (путь уже ревалидируется).
- Modify: `app/(admin)/admin/team/page.tsx` — вход в редактирование.

**DoD:**
- [ ] Правка specialty/bio/опыта/сертификатов сохраняется и видна на `/about`.
- [ ] `isActive=false` убирает мастера с публичной страницы, из админки не пропадает.
- [ ] Порядок (`sortOrder`) управляем и соблюдается публично.
- [ ] Verify: `npm run build` + браузер (админка + публичный `/about`).

### Story 6: SEO-оптимизация публичного сайта

**Objective:** ключевые слова и органический рост для специализированного сервиса Mercedes-Benz G-Class
(Гелендваген). Сейчас SEO почти отсутствует.

**Evidence (аудит):** метаданные есть **только** в `app/layout.tsx` (общий title/description/keywords,
`openGraph` без title/description/url/images). **Нет:** `metadataBase`, per-page метаданных (0 файлов
с `metadata`/`generateMetadata` кроме рута), `app/sitemap.ts`, `app/robots.ts`, JSON-LD (0 вхождений),
canonical, OG-картинок, `noindex` на auth/utility. **Нет `<h1>`** на: `/` (заголовок героя — `<h2>`),
`/about`, `/contacts`, `/models`, `/services`, `/rentals`, `/vacancies`. Ключевые слова без
«Гелендваген»/«G-Class»/«G63»/гео. Hero-картинка с `alt=""` (`app/(public)/page.tsx:94`).

**Sub-tasks (порядок = приоритет):**
1. Рут: `metadataBase`, расширенные keywords (Гелендваген/Gelandewagen/G-Class/G63/G500 + гео), полный `openGraph`, `twitter`, `icons`.
2. `app/robots.ts` — disallow `/admin`, `/cabinet`, `/api`, `/login`, `/register`, `/reset-password`, `/estimate`, `/parts/cart`; ссылка на sitemap.
3. `app/sitemap.ts` — статика + динамика из Prisma (services/models/parts/rentals) с `lastModified`.
4. Per-page `metadata` для ~9 статических маркетинговых страниц (уникальные title/description/canonical).
5. `generateMetadata` для 4 динамических маршрутов (service/model/part/rental) из Prisma, мемоизация через React `cache`.
6. `noindex` на auth/utility (вкл. токенную `/estimate/[token]`).
7. JSON-LD: `AutoRepair`+`Organization` в `app/(public)/layout.tsx`; `FAQPage`+отзывы на главной; `Service`/`Product`/`BreadcrumbList` на детальных.
8. OG-картинки: задействовать `public/images/hero/g-class-*.jpg` либо динамический `opengraph-image.tsx`.
9. Заголовки/alt: реальный `<h1>` на перечисленных страницах, осмысленный keyword-alt для hero.

**Next 16 API (сверено с `node_modules/next/dist/docs`):**
- `export const metadata` / `export async function generateMetadata` — только Server Components, вместе в одном сегменте не живут.
- `metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL!)` — без него относительные OG/canonical падают на билде.
- `app/sitemap.ts` → `MetadataRoute.Sitemap`; `app/robots.ts` → `MetadataRoute.Robots`.
- JSON-LD — `<script type="application/ld+json">` с экранированием `<` → `<`.
- Prisma-загрузчики для `generateMetadata` оборачивать в React `cache` (мемоизация `fetch` на них не распространяется).

**DoD:**
- [ ] Каждая публичная страница имеет уникальные title/description/canonical.
- [ ] `/sitemap.xml` и `/robots.txt` отдаются и содержат корректные URL (прод-домен).
- [ ] JSON-LD валиден (Rich Results Test) для AutoRepair/Organization и детальных страниц.
- [ ] Auth/utility страницы `noindex`; токенная смета не индексируется.
- [ ] На каждой маркетинговой странице ровно один осмысленный `<h1>`.
- [ ] Verify: `npm run build` + браузер (view-source метатегов, /sitemap.xml, /robots.txt).

## Verification Evidence

(заполняется по мере выполнения)
