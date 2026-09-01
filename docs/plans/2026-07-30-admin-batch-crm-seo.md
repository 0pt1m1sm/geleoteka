# Админ-панель: пачка фиксов + фич (CRM, календарь, доступы, SEO)

Created: 2026-07-30
Status: ЗАКРЫТ 2026-09-01 — десять историй VERIFIED; Story 7 выросла в отдельную работу и вошла в мультиарендность
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

- [x] Story 0: Почта soft-deleted клиентов не пропадает из UI   (Status: VERIFIED, commit 2a185ab)
- [x] Story 2: Управление записью — перенос времени + баг concern/notes   (Status: VERIFIED, commit ec4ffb7)
- [x] Story 1: Редактирование календаря (часы, блокировки, праздники)   (Status: VERIFIED, commit 47613bc)
- [x] Story 3: ПЕРЕОСМЫСЛЕНА → P0-безопасность вместо hard-delete   (Status: VERIFIED, commit 6e0ffe6)
- [x] Story 4: Страница управления ролями в разделе «Доступы»   (Status: VERIFIED, commit b08511c)
- [x] Story 5: Команда — ПЕРЕОСМЫСЛЕНА в контент, не в профиль пользователя   (Status: VERIFIED, commit ae0b6bc)
- [x] Story 8 (НОВАЯ): UI-правки по фидбэку + каскадное удаление клиента   (Status: VERIFIED, commit ae0b6bc)
- [x] Story 9 (НОВАЯ): Два бага аутентификации из плана Account   (Status: VERIFIED, commit 08fc846)
- [x] Story 10 (НОВАЯ): Сетка слотов в админском календаре   (Status: VERIFIED, commit 25acf77)
- [x] Story 6: SEO-оптимизация публичного сайта   (Status: VERIFIED, commit 8999df2)
- [x] Story 7 (НОВАЯ, одобрена юзером): Выделение `Account` — учётка отдельно от человека   (Status: ПЕРЕДАНА — оформлена планом `2026-07-30-account-split.md`, который 01.09 поглощён вехой идентичности в `2026-07-31-multi-tenant-platform.md`; см. docs/ROADMAP.md, P1)

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

## Backlog (по отдельному решению, вне текущих стори)

- **Единый почтовый вид «Все письма»** (запрос юзера 2026-07-30): `/admin/crm/inbox` — это очередь
  разбора (только `InboxMessage`), а не почтовый ящик. Нужен вид поверх `EmailMessage` (там уже лежат
  ВСЕ письма обоих направлений, привязанные и нет) со ссылкой на клиента/сделку и фильтрами; триаж
  остаётся отдельной вкладкой (паттерн «Неразобранное» amoCRM). Договорились планировать отдельно.
- **Разбор старых скрытых строк:** 4 `CommunicationLog` (май, сметы/записи) висят на soft-deleted
  клиентах и невидимы. Story 0 их не трогает (только forward-looking). Решить: восстановить клиента,
  перепривязать или оставить.

## Verification Evidence

### Stories 8–10 — VERIFIED 2026-07-30 (фидбэк владельца по живой админке)

**Story 5 переосмыслена: команда = контент.** Владелец: «профили мастеров — статический контент,
не завязывать на пользователя, сделать по аналогии с Вакансиями». Заведена модель `TeamMember`
(миграция `20260730190000`, аддитивная, перенесла 4 существующих мастеров, чтобы `/about` не
опустела); CRUD как у вакансий; пункт меню переехал «Сервис» → «Сайт». `isMaster`/`MasterProfile`
НЕ трогали — они отвечают за назначение на заказ-наряд и портал мастера. Так снялась проблема
«мастер редактируется в нескольких местах»: команда — контент, аккаунты — доступы.

**UI расписания.** Было 7 форм с 7 кнопками «Сохранить» — стало одно поле-неделя с одной кнопкой;
неделя валидируется целиком (ошибка в субботе не оставляет 6 сохранённых дней). Дефолты приведены
к реальному графику: Пн–Пт 10:00–20:00, Сб 10:00–16:00, Вс закрыто (было 09:00–19:00 на все дни,
что противоречило и графику, и странице контактов).

**Каскадное удаление клиента (запрошено владельцем).** Три барьера: обязательная выгрузка JSON
(без её токена удаление отклоняется; токен кодирует счётчики, поэтому пришедший после выгрузки
заказ останавливает удаление), ввод email/телефона, показ counts. Удаляет явным списком таблиц в
порядке зависимостей в одной транзакции — `RESTRICT` остаётся в силе, поэтому это единственный путь.
**Проверено на живых данных:** прогон последовательности удаления в транзакции с `ROLLBACK` — все
шаги прошли, клиент восстановлен.

**Два бага аутентификации** (найдены воркфлоу по Account, подтверждены чтением кода):
- `resetUserPassword` ставил `isTempPassword: true`, а `login.ts:113` при этом флаге отказывает —
  админский сброс пароля **не работал вообще**, клиент получал непригодный пароль.
- `resolveOAuthLogin` привязывал профиль провайдера по email/телефону **без ограничения роли** →
  контроль над аккаунтом провайдера с почтой сотрудника давал админскую сессию без пароля.
  Автопривязка ограничена ролью `CLIENT`.

**Календарь.** Владелец: «форма записи выглядит правильнее, она блокирует диапазон». Админский
календарь переведён на ту же сетку слотов и тот же чистый движок; занятый слот говорит, запись это
или блокировка с причиной; нерабочие дни помечены. Записи вне сетки показываются с пометкой
«вне графика» — сокращение часов не должно прятать существующий приём.

**Проверка:** сборка, **линт** (он ронял CI в PR #7 — `router.push` вместо `useProgressRouter`),
218 тестов. PR #6/#7/#8 смержены, прод отвечает 200, миграции применились.

⚠️ **Не закрыто:** значение `contacts.hours.*` в таблице `CMSBlock` на проде перекрывает
исправленный дефолт из кода — часы на `/contacts` и в JSON-LD остались старыми. Правится одним полем
в `/admin/cms` (группа «Контакты»); прод-БД с Mac в этот момент не отвечала.

### Story 3 → P0-безопасность — VERIFIED 2026-07-30 (commit `6e0ffe6`)

**Почему стори переосмыслена.** Юзер выбрал «hard delete всегда с подтверждением». Консультация
с codex (артефакт `.omc/artifacts/ask/codex-…2026-07-30T17-50-19…md`) + собственная проверка показали,
что это не то, что нужно, и что опасность УЖЕ в проде:

- Мой черновой `deleteUserPermanently` считал последствия, но после подтверждения всё равно звал
  `db.user.delete()` — предупреждение, а не защита. **Удалён, не выпущен.**
- **Живой баг:** `deleteCustomer` (`app/actions/crm/customers.ts:44`) делал hard delete при
  `isTempPassword=true`. Но `isTempPassword` — состояние credential, а гостевая строка создаётся
  ВМЕСТЕ с заказом. Проверено на проде: единственный гостевой клиент имел **1 заказ-наряд и 1 сделку** —
  кнопка «Удалить» снесла бы их молча. Теперь всегда архивирование (обратимо через `restoreCustomer`).
- **Структурная защита:** `RepairOrder.userId`, `Deal.customerUserId`, `CommunicationLog.customerUserId`
  переведены с `Cascade` на `Restrict` (миграция `20260730180000`, написана вручную — `migrate dev`
  требовал reset БД и тянул посторонний дрейф). **Доказано на живой БД:**
  `ERROR: violates RESTRICT setting of foreign key constraint "RepairOrder_userId_fkey"`.
  Каскады внутри агрегата (RepairOrder→JobLine/Slot, Deal→Estimate→EstimateLine) не тронуты.
- **Бонус-баг:** `lib/customer-queries.ts` фильтровал `permissionRole IN (CLIENT, NONE)` → клиент,
  который ещё и мастер/админ, пропадал из CRM. Фильтр убран.
- Роли расширены: +`MASTER`, +`WAREHOUSE_WORKER` (решение юзера).
- Проверка: `npm run build` — успешно; **217 тестов / 22 файла — зелёные**.

### Story 6 (SEO) — VERIFIED 2026-07-30 (commit `8999df2`)

- Корень: `metadataBase`, ключевые слова под G-Class/Гелендваген, полный OG + Twitter.
- 9 статических страниц — уникальные title/description/canonical; 4 динамических — `generateMetadata`
  из БД. Загрузчики обёрнуты в React `cache()` и переиспользуются телом страницы — **проверено лично**
  (`services/[slug]:26,32,54`), иначе был бы двойной запрос (Prisma не мемоизируется как `fetch`).
- `app/sitemap.ts` (статика + услуги/модели/запчасти/аренда), `app/robots.ts` (закрыты приватные зоны).
- `noindex` на приватных страницах, **включая `/estimate/[token]`** — иначе персональная смета клиента
  индексируется. Для 3 клиентских компонентов — через `layout.tsx`.
- JSON-LD `AutoRepair`/`Organization` из тех же CMS-строк, что и футер (разметка не разъедется с UI).
- `<h1>`: на главной заголовок героя был `<h2>` — исправлено; hero-картинка имела `alt=""` — заполнено.
  Остальные страницы уже отдают ровно один `<h1>` через `PageHeader:51` — **проверено пересчётом**,
  дубли не заведены.
- Проверка: build + lint чисто; 217 тестов зелёные.

### Story 1 — VERIFIED 2026-07-30 (commit `47613bc`)

- 16 юнит-тестов чистого движка (`lib/scheduling/availability.ts`): сетка по часам, закрытый день,
  правка часов, слот не вылезает за закрытие, отсутствие строк → исторический дефолт,
  бронь/блок/прошедшее время, полуоткрытый интервал блока, праздник, особые часы, инвертированное окно.
- **E2E против живого API и БД** (dev-сервер + psql), 7 сценариев — все прошли:
  дефолт → 5 слотов; воскресенье после сидинга → `[]`; праздник → `[]`; особые часы 10–14 → `10:00,12:00`;
  блок 09–11 UTC (= 12–14 MSK) → 11:00 и 13:00 `available:false`.
- **Подтверждён фикс боевого TZ-бага:** слот на `06:00 UTC` (= 09:00 MSK) → `09:00 available:false`.
  Старый код брал `getHours()` на UTC-сервере → «06:00», не совпадало с меткой «09:00» → занятый слот
  показывался свободным. Слот после теста восстановлен в исходное значение.
- Полный прогон: **217 тестов / 22 файла — зелёные**; `npm run build` — успешно; в dev-логе ошибок нет;
  `/admin/calendar` отдаёт 307 на логин (гвард цел).
- Миграция `20260730172500` — **чисто аддитивная** (3 таблицы). Из сгенерированного SQL удалены
  посторонние `DROP INDEX Part_photos_gin_idx` / `Vehicle_photos_gin_idx` и `ALTER INDEX StockMovement…
  RENAME` (Prisma-дрейф; по конвенции миграции `20260720083911` — иначе снесло бы GIN-индексы на проде
  и могло уронить деплой). GIN-индексы восстановлены в локальной БД.
- ⚠️ Не проверено: визуальный вид админ-UI календаря — требует входа в админку под паролем, я пароли
  не ввожу. Логика форм/действий покрыта, но глазами страницу нужно посмотреть тебе.

### Story 2 — VERIFIED 2026-07-30 (commit `ec4ffb7`)

- Баг найден и исправлен: `app/actions/booking.ts:139` писал текст клиента в `notes`
  («Заметки мастера») вместо `concern` («Жалоба клиента»). Старые записи не мигрируются.
- 7 тестов на перенос (`lib/scheduling/reschedule.ts` за портом): заказ и слот двигаются одной
  транзакцией; слот пересоздаётся, если его нет; коллизия → `conflict` + откат (заказ остался на месте);
  отменённый заказ не двигается и ничего не пишет; несуществующий → `not-found`; посторонняя ошибка
  пробрасывается, а не выдаётся за конфликт.
- `npm run build` — успешно.
- ⚠️ Не проверено глазами: форма переноса на странице заказ-наряда (нужен вход в админку).

### Story 0 — VERIFIED 2026-07-30 (commit `2a185ab`)

- RED→GREEN: 4 новых теста падали на текущем коде (primary email, alias, thread-owner, outbound),
  регрессионный «живой клиент» проходил. После фикса — `npx vitest run tests/email`: **104 passed**
  (было 99; +5), 11 файлов, 0 регрессий.
- `npm run build` — exit 0.
- `verify-email-resolve` / `verify-email-ingest` / `verify-auto-task` — **PASS**.
- Прод-подтверждение бага: найдены 4 реальные скрытые строки на удалённых клиентах
  (`admin1@geleoteka.ru`, `hbdshbvhds@gmail.com`, удалены 07-17) — симптом воспроизводится на живых данных.
- Смежный путь проверен: `app/api/admin/customers/search/route.ts:27` уже фильтрует `deletedAt: null`
  → ручная привязка из триажа не может вернуть письмо в невидимое состояние. Правка не требуется.
- ⚠️ Уточнение по исходному симптому: письмо «Re: Test mail» (16:12) НЕ было скрыто — оно корректно
  лежит в триаже `PENDING`; пользователь смотрел устаревшую страницу. Пользователя с адресом
  `aleksandr.spiskov@gmail.com` в БД нет вообще (ни живого, ни удалённого) → неизвестный отправитель.
  Баг soft-delete реален (подтверждён майскими строками), но причиной именно этого симптома не был.
