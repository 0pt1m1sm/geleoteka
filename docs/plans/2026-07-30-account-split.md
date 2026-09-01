# Выделение `Account` — учётная запись отдельно от человека

Created: 2026-07-30
Status: ПОГЛОЩЁН 2026-09-01 — отдельно не выполняется, вошёл в веху идентичности плана
`docs/plans/2026-07-31-multi-tenant-platform.md` (владелец 01.09 выбрал полный объём
мультиарендности). Три цели этого плана остаются требованиями там: управление учёткой в
админке, смена логина отдельно от контактов CRM, слияние дублей клиентов. Разбор развилок
ниже сохранён — он не устарел, изменился только владелец работы. См. docs/ROADMAP.md, P1
Mode: gated
Iterations: 0
Type: Refactor+Feature (schema migration, auth surface)
Engine: ultraralph (durable plan-as-ledger)

## Summary

Сегодня `User` — это одновременно человек (Party: имя, CRM-контакты, вся история обслуживания)
и учётная запись (email/телефон как логин, `passwordHash`, `permissionRole`, `deletedAt`).
Из-за этого «удалить учётку» = «удалить клиента с заказ-нарядами», а «сменить email» = «сменить логин».

План выделяет `Account` — отдельную сущность 0..1 к `User`. `User` остаётся стабильной бизнес-сущностью:
`RepairOrder`, `Deal`, `CommunicationLog`, `Vehicle`, `LoyaltyAccount`, CRM-задачи продолжают висеть
на `User.id` и **не двигаются никогда**. Удалять и пересоздавать разрешено только `Account`.

Три состояния, сегодня склеенные в `User.deletedAt` + `permissionRole = "NONE"`, разводятся:

| Состояние | Поле после миграции | Может войти | Виден в CRM | Резолвинг почты |
|---|---|---|---|---|
| Учётки нет вовсе | нет строки `Account` | нет | да | вяжется |
| Вход заблокирован | `Account.status = DISABLED` + `disabledAt` | нет | да | вяжется |
| Клиент архивирован | `CustomerProfile.archivedAt` | да* | скрыт | триаж |

\* модель не запрещает; операция «архивировать клиента» в UI дополнительно гасит `Account` —
поведение оператора не меняется, но модель перестаёт врать.

**Архитектурная развилка, решённая явно.** Судьи разошлись: один выбрал «минимальный риск»
(триггер-зеркало + рантайм-флаг), второй — «чистоту модели» (роль на Account, contract с архивной
таблицей). Взято следующее:

- **Зеркало — приложением, не Postgres-триггером.** Проверено: в 56 миграциях репозитория **ноль**
  `CREATE TRIGGER` / `CREATE FUNCTION`, а `prisma migrate dev` (документированная команда разработки)
  такие объекты сносит и не возвращает. Триггер стал бы единственным гарантом консистентности кредов
  и при этом невидимым и для Prisma, и для локальной разработки. Вместо него — **единый порт записи**
  `lib/accounts/credentials.ts` с сигнатурой `(tx, ...)`, тестируемый существующим
  `tests/helpers/fake-db.ts`.
- **Рантайм-килсвитч — берём (это лучшая идея проигравшего плана).** Флип чтений auth-пути живёт
  за флагом, который откатывается **без деплоя**. Но с поправкой на найденный риск: флаг читается
  **сначала из env**, а не из таблицы, иначе рычаг отката заперт за той самой аутентификацией,
  которую он выключает.
- **`permissionRole` остаётся на `User` в основном пути.** Замер: 185 вызовов `requireRole` в 71 файле,
  и все читают `session.permissionRole` из `getSession()`. Переносить роль не нужно ни для одной
  из двух целей владельца. Зеркало `Account.permissionRole` пишется с первого дня и читается только
  в **опциональной** Story 10 — там честно 17 мест на уровне БД, а не 185.
- **Архив — свойство роли, а не человека** (идея плана «чистота модели»): `CustomerProfile.archivedAt`
  для клиентов, `MasterProfile.isActive` (уже существует) для персонала.

Прод живой (geleoteka.ru, реальный бизнес), миграции накатываются на старте, прод-БД снаружи
недоступна (анти-DDoS Timeweb). Поэтому: каждая стори оставляет прод рабочим, каждая аддитивная
миграция откатывается `DROP`, contract идёт **только после ≥2 недель наблюдения**.

## Goals

1. Владелец может **удалить и пересоздать учётную запись**, не тронув историю обслуживания человека.
2. Владелец может **сменить email/телефон** человеку, не сломав ему вход, и сменить логин, не тронув
   CRM-контакты.
3. Владелец может **слить дубли клиентов** (человек завёлся дважды под разными адресами) с переносом
   всех бизнес-FK и дедупликацией контактов.
4. Блокировка перестаёт быть разрушительной: `setUserDisabled` сегодня затирает `permissionRole`
   и `passwordHash`, а разблокировка безусловно ставит `CLIENT` — исходная роль теряется навсегда.
5. Появляется ревокация сессий (`sessionVersion`) при смене пароля/логина и «выйти на всех устройствах».

## Out of Scope

Явно НЕ делаем — ни в одной стори, ни «заодно»:

- **Отдельная таблица `Customer` с переносом бизнес-FK.** Признано преждевременным (20–30 дней,
  высокий риск). История остаётся на `User.id`.
- **Переименование `User` → `Party`.** Чистое переименование, максимальный шум в diff при нулевой
  пользе; `session.id` навсегда остаётся `User.id` — это якорь, благодаря которому 185 `requireRole`
  не трогаются вовсе.
- **`ContactPoint`** (единая таблица контактов вместо `User.email` + `User.phone` + `CustomerContact`).
  Сегодня три несогласованных пространства имён для email, и это реальная грязь — но её лечение
  трогает ~40 call-site'ов и требует своего плана.
- **`DROP INDEX User_email_key` / `User_phone_key`.** Проверено: `lib/customer-onboarding.ts:81,95`,
  `app/actions/login.ts:41,48`, `request-password-reset.ts:23`, `confirm-reset-password.ts:27`
  используют `findUnique` по этим колонкам. Снятие уникальности ломает все три чекаута
  (`booking.ts`, `part-orders.ts`, `rentals.ts`) и убирает БД-гарантию, на которую опираются пре-чеки
  в `register.ts` и `customers.ts`. Отдельный проект.
- **`DROP COLUMN User.deletedAt`.** Проверено grep'ом: колонку читают 12 файлов, включая
  `app/(admin)/admin/roles/page.tsx:*`, `app/(admin)/admin/crm/deals/page.tsx`,
  `app/api/admin/customers/search/route.ts`, guard последнего админа в `purgeEmptyUser`
  (`user-management.ts:106`). Колонка ничего не стоит — оставляем.
- **Удаление значения `NONE` из enum `UserPermissionRole`.** Обмен типа на живой БД ради косметики.
- **Смена пароля клиентом в кабинете** (сегодня её нет вовсе) — попадает в Story 7 только как
  побочный эффект `sessionVersion`; полноценный UX кабинета — отдельно.
- **Хеширование кодов сброса, CSPRNG вместо `Math.random`, лимит попыток** — безопасность
  `PasswordReset`, самостоятельная задача; смешивать с миграцией схемы вредно.

## Конвенции (обязательно)

- Next.js 16.2.3 App Router + Turbopack — **модифицированный** Next: перед кодом читать
  `node_modules/next/dist/docs`.
- Prisma-клиент из `@/app/generated/prisma/client` (НЕ `@prisma/client`); db-синглтон `@/lib/db`.
- Типы теряются через `db`-синглтон → явные type-assertions (`.claude/rules/geleoteka-conventions.md`).
- Auth: в page-компонентах **только** `getSession()` + `redirect()`; `requireRole()` кидает —
  годится в server actions.
- Мутации — server actions в `app/actions/*.ts` (`"use server"`), затем `revalidatePath`.
- **Миграции писать руками.** `npx prisma migrate dev` в этом репозитории требует reset БД и тянет
  посторонний дрейф (GIN-индексы `Part_photos_gin_idx` / `Vehicle_photos_gin_idx`, переименование
  индекса `StockMovement`) — зафиксировано в шапке миграции `20260730180000` и в Verification Evidence
  плана `2026-07-30-admin-batch-crm-seo.md`.
- Тесты — паттерн «порт + фейк»: чистая функция принимает порт первым аргументом, тест подаёт
  in-memory фейк (`tests/helpers/fake-db.ts`, `lib/wms/public`, `lib/email/db-port`).

## Progress Tracking

- [ ] Story 0: Порт аутентификации + тесты текущего поведения + fail-fast старта   (Status: PENDING, ~1.5 дн)
- [ ] Story 1: Два живых бага до всякой схемы (temp-пароль, OAuth-эскалация)   (Status: PENDING, ~1 дн)
- [ ] Story 2: M1 аддитивная — таблица `Account`, backfill, dual-write через порт   (Status: PENDING, ~2.5 дн)
- [ ] Story 3: Клеймы `aid`/`sv` в JWT, толерантный режим   (Status: PENDING, ~0.5 дн + 8–10 дн выдержки)
- [ ] Story 4: Флип чтений auth-пути за флагом `ACCOUNT_AUTH_READS`   (Status: PENDING, ~1.5 дн)
- [ ] Story 5: Управление учёткой в админке — удалить / пересоздать / заблокировать   (Status: PENDING, ~2 дн) ← **ЦЕЛЬ 1**
- [ ] Story 6: Разведение архива — `CustomerProfile.archivedAt` / `Account.disabledAt`   (Status: PENDING, ~1 дн)
- [ ] Story 7: Смена логина отдельно от CRM-контактов + ревокация сессий   (Status: PENDING, ~1 дн) ← **ЦЕЛЬ 2**
- [ ] Story 8: Слияние дублей клиентов   (Status: PENDING, ~3 дн) ← **ЦЕЛЬ 3**
- [ ] Story 9: M2 CONTRACT — снос зеркал (только после ≥2 недель наблюдения)   (Status: PENDING, ~1 дн)
- [ ] Story 10 (ОПЦИОНАЛЬНАЯ): `permissionRole` переезжает на `Account`   (Status: OPTIONAL, ~1 дн)

**Оценка: ~15 инженерных дней** (без опциональной Story 10 — ~14). Календарно **5–7 недель**:
между Story 3 и Story 4 обязательная выдержка 8–10 суток (выгорание 7-дневных JWT), между Story 5
и Story 9 — ≥2 недели наблюдения. Первая ценность владельцу (удалить/пересоздать учётку) —
конец Story 5, ориентировочно 9-й инженерный день / 3-я неделя календаря.

**Порядок миграций:** M1 (Story 2) — **аддитивная**, откат = `DROP`. M-merge (Story 8) — **аддитивная**,
но данные слияния необратимы миграцией. M2 (Story 9) — **CONTRACT**, необратима схемно.
Всё остальное — только код.

## Implementation Tasks

### Story 0: Порт аутентификации + тесты текущего поведения + fail-fast старта

**Objective:** сделать auth-путь тестируемым и остановить деплой на упавшей миграции — **до** того,
как схема начнёт меняться. Сегодня покрытие `lib/auth.ts`, `login.ts`, `register.ts`,
`oauth-login.ts`, `user-management.ts` — **ноль** (`requireRole` лишь замокан в двух email-тестах).
Флипать шесть критичных чтений вслепую на живом проде нельзя.

**Evidence:**
- `package.json:8` — `"start": "npx prisma migrate deploy || echo '[start] migrate deploy failed — app boots anyway, investigate logs'; next start ..."`.
  Приложение поднимается на непромигрированной схеме. Начиная со Story 4 это означает
  `P2021 table "Account" does not exist` в `getSession`, а `getSession` вызывается из
  `app/(public)/layout.tsx` → 500 на **публичном** сайте автосервиса, не только в админке.
- `app/api/auth/oauth/[provider]/callback/route.ts:88-96` — вторая, рукописная точка выпуска сессии:
  route handler не может использовать `setSessionCookie()` из `next/headers`, поэтому атрибуты куки
  и вызов `createToken` продублированы вручную и расходятся при любой правке `lib/auth.ts:38-47`.
- Три независимые копии таблицы «роль → лендинг»: `login.ts:126-132`,
  `callback/route.ts:29-33`, `customer-onboarding.ts:11-16`.

**Files:**
- Create: `lib/auth/port.ts` — `AuthDbPort` (`findUserForSession`, `findUserByEmail`, `findUserByPhone`).
- Create: `lib/auth/resolve-session.ts` — `resolveSession(port, payload)`, чистая.
- Create: `lib/auth/resolve-login.ts` — `resolveLogin(port, {identifier, password})` → размеченный
  результат `ok | wrong_credentials | no_password | temp_password | disabled`.
- Create: `lib/auth/landing-for-role.ts` — одна таблица вместо трёх копий.
- Modify: `lib/auth.ts` — тонкая обёртка (cookies + `cache()` + `db`); экспорт `SESSION_COOKIE_OPTS`
  и `issueSession(user)`.
- Modify: `app/api/auth/oauth/[provider]/callback/route.ts` — импортирует `issueSession`
  вместо своей копии.
- Modify: `app/actions/login.ts` — остаётся только cookie + redirect.
- Modify: `package.json` — `start` без `|| echo`.
- Create: `tests/helpers/fake-auth-db.ts`, `tests/auth/session.test.ts`, `tests/auth/login.test.ts`,
  `tests/auth/oauth-resolve.test.ts`, `tests/auth/guest-claim.test.ts`.

**Key decisions:**
- Тесты фиксируют **сегодняшнее** поведение как контракт, а не желаемое: отказ по `deletedAt`
  (`lib/auth.ts:73`), отказ по `permissionRole === "NONE"` (`:76`), отказ по `isTempPassword`
  (`login.ts:113`), эвристика `findUserByIdentifier` (`@` → email, иначе `normalizePhone` +
  `/^\+7\d{10}$/`), пять ступеней `resolveOAuthLogin` (`lib/oauth-login.ts:41-100`), отказ
  `setPasswordForGuestUser` при `!isTempPassword` (`customer-onboarding.ts:88-90`),
  constant-time `tokensMatch`.
- **[РИСК: упавшая миграция не останавливает старт → 500 на публичном сайте]** `start` становится
  fail-fast (`npx prisma migrate deploy && next start`). Дополнительно — boot-probe в `lib/db.ts`
  или в `lib/auth.ts`: если `to_regclass('"Account"') IS NULL`, процесс на весь свой срок жизни
  уходит в legacy-режим чтения и пишет громкий WARN, вместо того чтобы кидать `P2021` на каждый
  запрос. Обе меры нужны: fail-fast ловит штатный случай, boot-probe — случай «миграция прошла,
  но откатили только код».
- **[РИСК: строгий режим + вторая точка выпуска куки = вечный редирект-цикл на OAuth]**
  Устраняется здесь, до появления клеймов: единственная `issueSession()` + экспортируемая
  `SESSION_COOKIE_OPTS`; тест перечисляет **все 8 точек выпуска** (`login.ts:87,123`,
  `register.ts:96`, `confirm-reset-password.ts:54`, `customer-onboarding.ts:116,240`,
  `oauth-complete.ts:71`, `callback/route.ts:90`) и утверждает, что каждая идёт через неё.
- Рефакторинг деплоится **отдельным** коммитом и стоит на проде ≥сутки. Если после него сломался
  вход — сломался рефакторинг, а не `Account`. Смешивать нельзя.

**DoD:**
- [ ] `lib/auth.ts` не содержит ветвящейся логики; вся она в `lib/auth/*` за портом.
- [ ] ≥30 `it()` в `tests/auth/**`, зелёные, поведение байт-в-байт прежнее.
- [ ] Тест: все 8 точек выпуска сессии идут через `issueSession()`; атрибуты куки в одном месте.
- [ ] `npm start` падает, если `prisma migrate deploy` вернул ненулевой код (проверить локально,
      подсунув заведомо битую миграцию в копию).
- [ ] Boot-probe: при отсутствии таблицы `Account` приложение поднимается в legacy-режиме
      и логирует WARN (проверить на локальной БД без миграции M1).
- [ ] Verify: `npx vitest run` (217+ существующих зелёных, регрессий нет) + `npm run build` +
      браузер: вход паролем, вход через Яндекс, сброс по SMS, гостевой claim из письма — все четыре
      сценария работают как до рефакторинга.

---

### Story 1: Два живых бага до всякой схемы  ⚠️ GATED (auth)

**Objective:** починить два подтверждённых бага, которые иначе будут молча протащены в новую
архитектуру и там переопределены как «изменение поведения».

**Evidence (баг A — админский сброс пароля физически не работает):**
`app/actions/user-management.ts:171` — `data: { passwordHash, isTempPassword: true }`, следом
`:175-180` SMS с временным паролем. Но `app/actions/login.ts:113-115` отвергает вход при
`isTempPassword` с текстом «Пароль не задан. Восстановите его по SMS.». Менеджер выдаёт клиенту
пароль, которым войти нельзя. При этом комментарий схемы `prisma/schema.prisma:337-340` определяет
`isTempPassword` как «passwordHash сгенерирован гостевым флоу booking/cart» — `resetUserPassword`
использует поле не по назначению.

**Evidence (баг B — эскалация привилегий через OAuth):**
`lib/oauth-login.ts:54-59` матчит профиль провайдера по `User.email` **без ограничения роли**;
`guard()` (`:26-32`) пропускает всех, кроме `deletedAt` и `NONE`; `callback/route.ts:29-33`
отправляет `ADMIN`/`MANAGER` на `/admin`. Совпадение email из Яндекс-профиля с email администратора
даёт админскую сессию без пароля.

**Files:**
- Modify: `app/actions/user-management.ts` — `resetUserPassword` ставит `isTempPassword: false`.
- Modify: `lib/oauth-login.ts` — авто-линк по email/телефону только для `permissionRole === "CLIENT"`.
- Modify: `tests/auth/login.test.ts`, `tests/auth/oauth-resolve.test.ts` — RED→GREEN.

**Key decisions:**
- Баг A чиним минимально и в сторону документированного контракта: `isTempPassword` снова означает
  ровно «гостевая заглушка», админский временный пароль — обычный пароль. Функция «заставить
  сменить при следующем входе» появляется позже как `Account.mustChangePassword` (Story 4) —
  сейчас её нет и не было.
- Побочный эффект, который надо проговорить с менеджерами: сценарий «сбросил пароль клиенту»
  начинает работать. Проверить, не выстроился ли вокруг поломки обходной процесс.
- Баг B: при совпадении контактов с не-CLIENT возвращаем `pending` (форма дозаполнения), а не
  молчаливый вход. Для персонала привязка провайдера — только явная, из профиля (вне скоупа этой
  стори; пока просто нет авто-линка).
- Обе правки — **до** любой схемной работы, отдельным деплоем. Иначе на разборе инцидента будет
  неясно, что сломалось: миграция или фикс.

**DoD:**
- [ ] RED-тест: `resetUserPassword` → выданным паролем можно войти (сегодня падает).
- [ ] RED-тест: OAuth-профиль с email администратора → `pending`, не `login` (сегодня падает).
- [ ] Регрессия: OAuth-профиль с email обычного клиента по-прежнему логинит и создаёт
      `OAuthAccount`; вход по уже существующей привязке (ступень 1) работает для любой роли.
- [ ] Гостевой claim не сломан: `setPasswordForGuestUser` по-прежнему отказывает аккаунту
      с настоящим паролем и принимает гостевой.
- [ ] Verify: `npx vitest run` + `npm run build` + браузер: админ сбрасывает пароль клиенту →
      клиент входит выданным паролем; вход через Яндекс под клиентским аккаунтом.

---

### Story 2: M1 аддитивная — таблица `Account`, backfill, dual-write через порт  ⚠️ GATED (schema)

**Objective:** завести `Account` и начать писать в неё, **ничего не читая**. После этой стори
поведение системы наблюдаемо не меняется ни в одном сценарии.

**Миграция:** `prisma/migrations/2026xxxxxxxxxx_account_expand/migration.sql` — **АДДИТИВНАЯ**.
Ни одного `DROP`, ни одного `ALTER` существующей колонки, ни одного нового `NOT NULL` без `DEFAULT`.
Откат = `DROP TABLE "Account"; DROP TYPE "AccountStatus"; ALTER TABLE ... DROP COLUMN ...`.

**Схема:**

```prisma
enum AccountStatus {
  ACTIVE       // может войти
  PROVISIONAL  // гостевая заглушка: hash от выброшенного рандома, пароль владельцем не задан
  DISABLED     // вход запрещён; роль, профиль и вся история сохранены
}

/// Учётная запись = способность войти. 0..1 к User.
/// User остаётся стабильной сущностью человека; вся история висит на User.id
/// и переживает удаление/пересоздание Account.
model Account {
  id                 String        @id @default(cuid())   // СЛУЧАЙНЫЙ, никогда не производный от userId
  userId             String        @unique
  loginEmail         String?       @unique
  loginPhone         String?       @unique
  passwordHash       String?
  mustChangePassword Boolean       @default(false)
  permissionRole     UserPermissionRole?                  // ЗЕРКАЛО User.permissionRole; читается только в Story 10
  status             AccountStatus @default(ACTIVE)
  disabledAt         DateTime?
  disabledReason     String?
  sessionVersion     Int           @default(1)
  lastLoginAt        DateTime?
  purgedAt           DateTime?                            // тумбстоун: учётка удалена осознанно
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  oauthAccounts  OAuthAccount[]
  passwordResets PasswordReset[]

  @@index([status])
}
```

`CustomerProfile` получает `archivedAt DateTime?` + `@@index`. `OAuthAccount` и `PasswordReset`
получают `accountId String?` + FK `ON DELETE CASCADE` (старые `userId` остаются до Story 9).
`User` получает единственное поле `account Account?`.

**SQL-порядок внутри миграции (важен):**

1. `CREATE TYPE "AccountStatus"`, `CREATE TABLE "Account"`, три `UNIQUE INDEX`,
   FK `Account_userId → User(id) ON DELETE CASCADE`.
2. `ALTER TABLE "Account" ADD CONSTRAINT "Account_disabled_consistent" CHECK ((status = 'DISABLED') = ("disabledAt" IS NOT NULL));`
3. **Добить недостающие `CustomerProfile`** (см. Key decisions), затем
   `ALTER TABLE "CustomerProfile" ADD COLUMN "archivedAt"` + индекс + backfill из `User.deletedAt`.
4. Backfill `Account` (предикат — см. Key decisions).
5. `ALTER TABLE "OAuthAccount"/"PasswordReset" ADD COLUMN "accountId"` + backfill + FK + индексы.

**Files:**
- Modify: `prisma/schema.prisma`.
- Create: `prisma/migrations/2026xxxxxxxxxx_account_expand/migration.sql` (руками).
- Create: `lib/accounts/credentials.ts` — **единственная** точка записи кредов:
  `createAccountFor(tx, userId, {...})`, `setAccountPassword(tx, userId, hash, {...})`,
  `setAccountRole(tx, userId, role)`, `setAccountStatus(tx, userId, status, reason)`,
  `setAccountLogin(tx, userId, {...})`, `revokeSessions(tx, accountId)`. Каждая пишет `Account`
  **и** зеркальные колонки `User` в одной транзакции.
- Modify (12 точек записи, все через порт): `app/actions/register.ts:41-53`,
  `app/actions/customers.ts:100-116`, `lib/customer-onboarding.ts:112-134`,
  `lib/oauth-login.ts:78-96`, `app/actions/oauth-complete.ts:53-68`,
  `app/actions/confirm-reset-password.ts:47-52`, `app/actions/request-password-reset.ts:40-45`
  (заполнить `accountId`), `app/actions/customer-onboarding.ts:108-114`,
  `app/actions/user-management.ts:171` (reset), `:192-238` (контакты), `:277` (роль), `:320,328` (disable),
  `app/actions/crm/customers.ts:51-54,75-78` (архив), `app/actions/suppliers.ts:45-48`.
- Create: `scripts/verify-account-mirror.ts` + npm-скрипт `verify-account-mirror`.
- Create: `app/api/admin/account-mirror/route.ts` (ADMIN) — тот же чек, запускаемый **внутри**
  приложения.
- Create: `tests/accounts/credentials.test.ts` на `fake-db`.

**Key decisions:**
- **Триггера нет.** Проверено: `grep -rl "CREATE TRIGGER\|CREATE FUNCTION" prisma/migrations/` → 0
  из 56 миграций. Триггер невидим для Prisma, сносится любым `migrate dev`/reset, и локальная
  разработка шла бы без зеркала — то есть баги dual-write не воспроизводились бы до прода.
  Зеркало держит порт `lib/accounts/credentials.ts`, ревьюируемый и покрытый тестами.
- **[РИСК: детерминированный id `'acc_'||userId` воскрешает удалённые учётки и оживляет старые JWT]**
  `Account.id` — только `cuid()`. Пересозданная учётка обязана иметь **новый** id, иначе клейм `aid`
  в ещё живых 7-дневных куках снова проходит проверку. Ни backfill, ни ре-backfill, ни какое-либо
  восстановление не имеют права вычислять id из `userId`.
- **[РИСК: backfill выдаёт Account поставщикам → уникальные loginEmail заняты навсегда]**
  Предикат backfill — **по наличию кредов**, а не по бизнес-флагу:
  `WHERE u."passwordHash" IS NOT NULL OR EXISTS (SELECT 1 FROM "OAuthAccount" o WHERE o."userId" = u.id)`.
  Проверено: `app/actions/suppliers.ts:45-48` создаёт поставщика с `passwordHash: null`,
  `permissionRole: "NONE"` — он корректно остаётся без `Account`, то есть состояние «человек без
  учётки» существует в проде **с первого дня** и покрывается кодом. Фильтровать по `isSupplier`
  нельзя: это обычный бизнес-флаг, который не снимается ни одним UI, а `/admin/users` жёстко
  фильтрует `isSupplier: false` — такой человек в разделе «Доступы» невидим и починить его через
  админку невозможно.
- **[РИСК: OAuth-only пользователи (`passwordHash: null`) остаются без единого пути входа]**
  Проверено: `lib/oauth-login.ts:84` и `app/actions/oauth-complete.ts:56` создают `User` c
  `passwordHash: null`. Именно поэтому предикат содержит вторую половину (`EXISTS OAuthAccount`).
  Отдельный ассерт в verify-скрипте: нет ни одного `User` с `OAuthAccount`, но без `Account`.
- **[РИСК: клиенты без строки `CustomerProfile` — архив теряется / клиент исчезает из CRM]**
  Подтверждено защитным комментарием в `lib/customer-queries.ts:70-73` («we keep the OR for safety»).
  Поэтому шаг 3 миграции **сначала** добивает профили:
  `INSERT INTO "CustomerProfile"("userId") SELECT id FROM "User" u WHERE u."isCustomer" AND NOT EXISTS (SELECT 1 FROM "CustomerProfile" p WHERE p."userId" = u.id);`
  Все будущие фильтры по `archivedAt` пишутся через `OR` с `{ customerProfile: null }`
  (как уже сделано для `blacklist`), а `deleteCustomer` — через `upsert`, не `update`
  (иначе `P2025` в админке).
- **[РИСК: `CHECK` + расщеплённое владение колонками ломает блокировку]** `CHECK` безопасен
  **только потому, что триггера нет**: `status` и `disabledAt` пишет один владелец — порт
  `credentials.ts`, всегда парой. Обязательный тест против **реального Postgres** (не fake-db):
  цикл `setUserDisabled(true) → setUserDisabled(false) → changeUserRole` + создание поставщика
  (`permissionRole: "NONE"`) не нарушает констрейнт.
- **[РИСК: self-heal пишет в БД из `getSession` → гонки P2002 и 500 из layout]**
  Ленивое создание `Account` в read-path **запрещено**. `getSession` (`lib/auth.ts:56`) вызывается
  из `app/(public)/layout.tsx` и `app/(admin)/layout.tsx` на каждый запрос, дедупликация только
  внутри одного рендера — два параллельных запроса дали бы `P2002` на `Account_userId_key` прямо
  из layout. Вместо этого: (а) окно роллинга закрывает fail-fast `npm start` из Story 0
  (`migrate deploy` завершается до старта нового процесса); (б) строки, созданные старым
  контейнером, добирает **одноразовый** `scripts/backfill-accounts.ts` с явной отсечкой
  по `createdAt`, запускаемый вручную после деплоя; (в) лечение — только в явных точках
  (`login`, `claim`, `oauth`), где транзакция уже открыта.
- **[РИСК: ре-backfill в миграции воскрешает удалённое]** Ре-backfill — **скрипт**, а не миграция:
  миграция может пройти повторно на другой копии БД. Скрипт исключает `userId`, у которых есть
  тумбстоун (`Account.purgedAt IS NOT NULL` либо запись в `AccountPurgeLog`).
- **[РИСК: `verify-account-mirror` негде запустить — прод-БД недоступна снаружи]**
  Скрипт оформлен двояко: как `tsx`-скрипт для локального прогона на дампе **и** как ADMIN-роут
  `/api/admin/account-mirror`, отдающий JSON `{ missing, extra, mismatched }`. Внешний планировщик
  (уже настроенный GitHub Actions для mail-sync, коммит `41d2435`) дёргает HTTP-эндпоинт,
  а не БД. Результат пишется в `Setting` (`account_mirror_last_check`, `account_mirror_mismatches`).
- Зеркало `Account.permissionRole` пишется портом с первого дня и **проверяется** verify-скриптом
  на равенство `User.permissionRole` — иначе колонка, которая три стори пишется и не читается,
  гарантированно разъедется.
- `status` при backfill: `DISABLED` если `deletedAt IS NOT NULL` **или** `permissionRole = 'NONE'`
  (и тогда `disabledAt` заполняется — иначе `CHECK` упадёт); `PROVISIONAL` если `isTempPassword`;
  иначе `ACTIVE`. Заблокированным ставим `permissionRole = 'CLIENT'` в зеркале: исходная роль уже
  безвозвратно затёрта сегодняшним `setUserDisabled:320`. **До миграции** выполнить
  `SELECT count(*) FROM "User" WHERE "permissionRole" = 'NONE' AND NOT "isSupplier"` и, если строк
  единицы, зафиксировать их прежние роли в комментарии миграции.

**DoD:**
- [ ] Миграция аддитивна: `git diff` не содержит `DROP`/`ALTER COLUMN` по существующим объектам.
- [ ] Backfill идемпотентен (`ON CONFLICT ("userId") DO NOTHING`), прогнан дважды на копии дампа —
      результат одинаковый.
- [ ] `count(Account)` = `count(User WHERE passwordHash IS NOT NULL OR EXISTS OAuthAccount)`.
- [ ] Ни одного `isCustomer` без `CustomerProfile`; ни одного `User` с `OAuthAccount`, но без `Account`.
- [ ] Ни один поставщик (`isSupplier`, `passwordHash IS NULL`) не получил `Account`.
- [ ] `Account.id` не начинается с `acc_` и не содержит `userId` ни у одной строки.
- [ ] Тест против **реального Postgres**: disable → enable → changeUserRole → создание поставщика
      не нарушают `Account_disabled_consistent`.
- [ ] `tests/accounts/credentials.test.ts`: каждая функция порта пишет `Account` **и** зеркало `User`
      в одной транзакции; при откате транзакции не остаётся ни одной из двух записей.
- [ ] `verify-account-mirror` (скрипт и роут) даёт 0 расхождений локально на дампе.
- [ ] **Поведение не изменилось:** вход паролем, вход через Яндекс, сброс по SMS, гостевой claim,
      создание клиента админом, блокировка/разблокировка, создание поставщика — все семь сценариев
      работают ровно как до стори (браузер + `npx vitest run`).
- [ ] `npm run build` зелёный; `npx prisma validate` зелёный.

---

### Story 3: Клеймы `aid`/`sv` в JWT, толерантный режим

**Objective:** дать токенам ручку на учётку и версию сессии, **не разлогинив никого**.

**Миграции нет.** Только код.

**Files:**
- Modify: `lib/auth.ts` — `JWTPayload` → `{ userId, permissionRole, aid?, sv? }`;
  `getSession` тянет `account` одним `include` (лишнего запроса нет — `Account.userId` уникален).
- Modify: `lib/auth/resolve-session.ts` — толерантные проверки.
- Modify: `app/actions/confirm-reset-password.ts`, `app/actions/customer-onboarding.ts` —
  интерактивная транзакция.
- Modify: `tests/auth/session.test.ts`.

**Key decisions:**
- Проверка **толерантная**, правило: «клейма нет — ведём себя как вчера».
  ```
  if (payload.aid && user.account?.id !== payload.aid) return null;   // учётку удалили/пересоздали
  if (payload.sv !== undefined && user.account?.sessionVersion !== payload.sv) return null;
  ```
  Оба чека — no-op для легаси-токенов. Откат кода тоже никого не разлогинивает: старый
  `verifyToken` делает `as JWTPayload` и лишние клеймы игнорирует. Толерантность работает
  в обе стороны — это и есть механизм безопасного отката.
- **Строгий режим (`aid` обязателен) в этой стори НЕ включается.** Он включается в Story 5 и
  **по `iat` токена**, а не по факту отсутствия клейма: отвергаются только токены, выпущенные
  позже даты cutover. Тогда забытая точка выпуска даёт заметный, но не блокирующий дефект вместо
  бесконечного редирект-цикла.
- **[РИСК: кука выдаётся с устаревшим `sessionVersion` → успешный сброс пароля выбрасывает
  на `/login`]** Подтверждённая форма: `confirm-reset-password.ts:27` читает user **до** транзакции,
  транзакция `:49-52` пишет пароль, токен создаётся из старого снимка. Как только в ту же
  транзакцию добавится `sessionVersion: { increment: 1 }`, свежая кука будет нести `sv` на единицу
  меньше актуального. Лечение: перевести обе точки (`confirm-reset-password.ts:47-57`,
  `customer-onboarding.ts:108-118`) на интерактивную `db.$transaction(async tx => ...)`, вернуть
  из неё обновлённую строку `Account` и подписывать токен значениями **из неё**.
- `Account.lastLoginAt` начинает писаться на успешном логине — дешёвая диагностика для Story 4
  (видно, идут ли входы после флипа).
- **Выдержка после деплоя — 8–10 суток** (`JWT_EXPIRES_IN` = 7d + запас). До её истечения
  Story 4 не выкатывается, Story 5 — тем более.

**DoD:**
- [ ] Легаси-токен без `aid`/`sv` проходит `getSession` (тест).
- [ ] Токен с `aid`, не совпадающим с текущим `Account.id`, отвергается (тест).
- [ ] Токен с устаревшим `sv` отвергается (тест).
- [ ] Все 8 точек выпуска отдают токен с `aid` и `sv` — тест перечисляет их поимённо,
      включая `app/api/auth/oauth/[provider]/callback/route.ts`.
- [ ] Регресс-тест «сброс пароля → сразу авторизован» и «claim → сразу авторизован» — зелёные
      (сегодня оба сценария не покрыты ничем).
- [ ] Verify: `npx vitest run` + `npm run build` + браузер: старая кука (не разлогиниваясь после
      деплоя) продолжает работать; новый вход даёт токен с клеймами (проверить декодом).
- [ ] **Календарь:** дата деплоя записана; Story 4 не начинается раньше чем через 8 суток.

---

### Story 4: Флип чтений auth-пути за флагом `ACCOUNT_AUTH_READS`  ⚠️ GATED (high risk: auth)

**Objective:** переключить шесть критичных чтений на `Account`. Записи всё ещё идут через порт
в оба места — расходиться нечему.

**Миграции нет.** Только код. Это осознанно: самая рискованная стори не совмещается с изменением схемы.

**Files:**
- Modify: `lib/auth/resolve-session.ts`, `lib/auth/resolve-login.ts`, `lib/oauth-login.ts`,
  `app/actions/request-password-reset.ts`, `app/actions/confirm-reset-password.ts`,
  `app/actions/customer-onboarding.ts` (`loginAndAttachOrder`).
- Create: `lib/accounts/flag.ts` — резолюция флага.
- Modify: `lib/settings.ts` — дескриптор в `KNOWN_SETTINGS`.
- Create: `scripts/toggle-account-flag.ts`.
- Modify: `tests/auth/**`.

**Key decisions:**
- **[РИСК: килл-свитч заперт за той самой аутентификацией, которую выключает]** Это главный
  найденный дефект исходной идеи. Проверено: `getSetting` (`lib/settings.ts:251`) читает БД;
  страница `/admin/settings/integrations` требует `getSession()` + ADMIN, а action —
  `requireRole(["ADMIN"])`. Если флип сломал вход администратору, откатить его через админку
  невозможно, а прод-БД снаружи недоступна. Поэтому:
  1. Порядок резолюции **для этого ключа инвертирован**: `process.env.ACCOUNT_AUTH_READS` имеет
     приоритет над строкой в `Setting`.
  2. Безусловный break-glass в `lib/auth.ts`, читаемый **до** любого обращения к `Account`:
     `if (process.env.ACCOUNT_AUTH_LEGACY === "1") → старый путь`.
  3. `scripts/toggle-account-flag.ts`, запускаемый на самом приложении (консоль Timeweb),
     не требующий сессии.
- **[РИСК: `getSetting` в хотпате — откат не «60 секунд», а до 60 секунд на каждый процесс,
  и падение чтения `Setting` даёт 500]** `CACHE` (`lib/settings.ts:15`) — обычный in-process `Map`
  с `TTL_MS = 60_000`, а `invalidateSetting` (`:278`) сбрасывает кэш **только на пишущем инстансе**.
  Честная формулировка для runbook: «до минуты на каждый процесс», запасной рычаг — env + редеплой
  либо ротация `JWT_SECRET`. Чтение флага обёрнуто в `try/catch` с дефолтом на legacy-путь:
  исключение при чтении `Setting` внутри `getSession` иначе превращается из деградации в 500
  на каждой авторизованной странице, включая саму страницу настроек.
- **[РИСК: флип молча возвращает вход архивированным клиентам и архивированному персоналу]**
  Проверено: `deleteCustomer` (`app/actions/crm/customers.ts:51-54`) пишет `deletedAt`, а
  `lib/auth.ts:73` рубит по нему сессию. Если `status` вычисляется только из `permissionRole`
  и `isTempPassword`, каждый «удалённый» получает `ACTIVE`. Поэтому: (а) backfill и порт **всегда**
  включают `deletedAt IS NOT NULL → DISABLED` (см. Story 2); (б) проверка `user.deletedAt`
  в `getSession`/`login` **не снимается** до Story 6, где решение «архив = выгнать или нет»
  подписывается владельцем явно. До тех пор гейт двойной.
- **[РИСК: OAuth-only пользователи]** Ступени 2/3 `resolveOAuthLogin` матчатся по
  `Account.loginEmail`/`loginPhone`; в ступень 4 (`db.user.create`, `oauth-login.ts:79-94`)
  добавляется `catch P2002` с фолбэком на линковку к существующему `User.email` — иначе такой
  человек уходит в `oauth_error=exchange_failed` (`callback/route.ts:52-64`) без объяснения.
  На весь переходный период `request-password-reset.ts` ищет по `Account.loginPhone`
  **с фолбэком на `User.phone`** — иначе анти-энумерация (`:25-27`) молча вернёт `{success:true}`
  без SMS, и поддержке нечего будет показать в логах.
- Разведение `PROVISIONAL` / `mustChangePassword`: гостевая заглушка (вход невозможен) и админский
  временный пароль (вход возможен, но требует смены) наконец различимы. Тексты ошибок логина
  сохраняются **дословно** — анти-энумерация.
- Выкатка: включаем в нерабочее время, наблюдаем 24 ч (`Account.lastLoginAt`, логи входов, жалобы).
  При любом сомнении — `off`.

**DoD:**
- [ ] Флаг `off` → поведение байт-в-байт как в Story 3 (полный прогон `tests/auth/**` в обоих режимах).
- [ ] Флаг читается env-first; `ACCOUNT_AUTH_LEGACY=1` возвращает старый путь **без** обращения
      к `Account` и **без** обращения к `Setting` (тест).
- [ ] Падение чтения `Setting` → legacy-путь, не 500 (тест с бросающим моком).
- [ ] `scripts/toggle-account-flag.ts` переключает флаг без сессии (проверено локально).
- [ ] Архивированный клиент (`deletedAt`) при флаге `on` войти **не может** (тест + ручная проверка).
- [ ] OAuth-only пользователь (`passwordHash: null`) при флаге `on` входит через провайдера (тест).
- [ ] Сброс пароля по SMS находит человека и при `Account.loginPhone`, и по фолбэку `User.phone`.
- [ ] Verify: `npm run build` + браузер при флаге `on`: вход паролем (клиент и админ), вход через
      Яндекс, сброс по SMS с реальной отправкой, гостевой claim из письма, вход временным паролем
      после админского сброса. Затем флаг `off` — те же шесть сценариев ещё раз.
- [ ] Runbook записан в `docs/` или в комментарии `lib/accounts/flag.ts`: три способа отката,
      честная задержка каждого.

---

### Story 5: Управление учёткой в админке — удалить / пересоздать / заблокировать  ⚠️ GATED (destructive)  ← ЦЕЛЬ 1

**Objective:** дать владельцу то, ради чего всё затевалось. Плюс убрать разрушительную блокировку.

**Миграции нет** (тумбстоун `purgedAt` и `AccountPurgeLog` заведены в M1).

**ПРЕДУСЛОВИЯ (жёсткие, проверить перед началом):**
1. Story 4 отработала на проде ≥7 суток при флаге `on`, `verify-account-mirror` = 0 расхождений.
2. **Флаг `ACCOUNT_AUTH_READS` и весь legacy-путь чтения УДАЛЕНЫ из кода.** См. Key decisions.
3. Прошло ≥8 суток с деплоя Story 3 (легаси-токенов без `aid` не осталось).

**Files:**
- Modify: `app/actions/user-management.ts` — `deleteAccount`, `createAccountFor`,
  `disableAccount`/`enableAccount` вместо `setUserDisabled`.
- Modify: `components/admin/UserAdminActions.tsx`, `app/(admin)/admin/users/[id]/page.tsx` —
  блок «Учётная запись».
- Modify: `app/(admin)/admin/users/page.tsx` — три раздельных бейджа вместо одного признака;
  `ROLE_FILTERS` (`:26-32`) дополнить `MASTER`/`WAREHOUSE_WORKER`.
- Modify: `lib/accounts/credentials.ts` — `purgeAccount(tx, userId)`.
- Create: `tests/accounts/lifecycle.test.ts`.

**Key decisions:**
- **[РИСК CRITICAL: откат флага после этой стори возвращает вход всем заблокированным и удалённым]**
  Разбор: `disableAccount` пишет `Account.status = DISABLED`, оставляя `User.permissionRole`
  и `User.passwordHash` валидными (в этом и смысл — не терять роль). Legacy-путь чтения
  (`lib/auth.ts:73,76`, `login.ts:55,107`) смотрит только на `deletedAt` и `NONE`. Значит
  переключение флага в `off` — это **рубильник восстановления привилегий** для каждого, кого
  заблокировали новым способом. Решение: **флаг гейтит только Story 4** и физически удаляется
  из кода до выкатки Story 5; legacy-ветки чтения удаляются вместе с ним. Пока флаг существует,
  новые блокировки обязаны дублироваться в старые поля — но проще и честнее удалить флаг.
  Тест-гейт перед выкаткой: «после `disableAccount` откат кода к Story 3 не даёт войти»
  и «после `deleteAccount` откат кода к Story 3 не даёт войти».
- **[РИСК CRITICAL: удалённая учётка воскресает]** Удаление — **тумбстоун, а не голый `DELETE`**:
  `Account.purgedAt = now()`, `status = DISABLED`, обнуление `loginEmail`/`loginPhone`/`passwordHash`
  (освобождает уникальные индексы), каскадное удаление `OAuthAccount` и `PasswordReset` строк
  учётки. Плюс `AccountPurgeLog` со снимком. Это делает «строки нет» и «строку удалили осознанно»
  различимыми для любого будущего backfill. `Account.id` при пересоздании — новый `cuid()`,
  поэтому клейм `aid` в живых куках больше не сходится.
- **`User.passwordHash` и `User.isTempPassword` обнуляются в той же транзакции.** Иначе (а) любой
  ре-backfill воссоздаст учётку из живого зеркала, (б) откат кода вернёт человеку вход по старому
  паролю. Плата: после отката такой человек не войдёт, пока админ не выдаст пароль заново —
  это осознанно и записано в диалоге подтверждения.
- **[РИСК CRITICAL/HIGH: `Deal.claimToken` переживает удаление учётки]** Проверено: `Deal.claimToken`
  пишется единственным местом (`lib/crm/public/create-deal.ts:35`) и **не обнуляется нигде**
  (в отличие от токенов заказов, которые гасятся в `customer-onboarding.ts:97-106`). Он даёт
  анонимный доступ к смете (`app/(public)/estimate/[token]/page.tsx:69`), её утверждению/отклонению
  (`app/actions/customer-estimates.ts:69,153`) и PDF (`app/api/estimates/[id]/pdf/route.ts:132`).
  Без зануления обещание «удалил учётку — отрезал доступ» ложно. `deleteAccount` в той же
  транзакции зануляет `claimToken` на связанных `Deal`, `RepairOrder`, `PartShipment`,
  `RentalBooking`.
- **[РИСК HIGH: окно между «удалить учётку» и переписанным claim-флоу — у человека ноль путей
  самообслуживания]** Поэтому обработка состояния «`Account` нет» в `setPasswordForGuestUser`
  (`app/actions/customer-onboarding.ts:88-90` — сегодня отвечает «У этого аккаунта уже есть пароль»)
  входит **в эту же стори**, а не в следующую. Ветки: нет `Account` → создать;
  `PROVISIONAL` → задать пароль; `ACTIVE` → отказ «войдите»; `DISABLED` → отдельный отказ.
  Плюс явный `catch P2002` на `Account.loginEmail` — email заказа может быть уже занят учёткой
  другого человека; сообщение «этот email привязан к другой учётной записи, войдите в неё».
- `disableAccount`/`enableAccount` **не разрушительны**: пишут только `status`/`disabledAt`/
  `disabledReason` + `sessionVersion++`. Разблокировка возвращает **сохранённую** роль, а не
  хардкод `CLIENT` (`user-management.ts:328`). Гварды «последний ADMIN» (`:309`) и «нельзя себя»
  (`:299`) переносятся 1:1.
- Строгий режим (`aid` обязателен) включается здесь и **по `iat`**: отвергаются только токены,
  выпущенные позже даты cutover.
- Ограничение, которое надо проговорить владельцу словами: **удаление учётки не освобождает
  email/телефон для другого человека** — `User.email`/`User.phone` остаются уникальными на строке
  человека. Освобождается только для новой учётки того же человека. Полная свобода адресов —
  Story 7 (дивергенция) и Story 8 (merge с tombstone).
- **Роль остаётся на `User`**, значит удаление учётки её не снимает: удалили учётку админа, завели
  заново — он снова ADMIN. Для клиентов это правильно, для персонала может удивить. Диалог
  пересоздания **обязан** показывать текущую роль. (Опциональная Story 10 меняет это.)

**DoD:**
- [ ] ADMIN удаляет учётку клиента с 3 заказ-нарядами → `Account` в тумбстоуне, `RepairOrder`,
      `Deal`, `CommunicationLog`, `Vehicle`, `LoyaltyAccount` целы (проверить counts до/после).
- [ ] Живая сессия удалённого умирает на **следующем** запросе, независимо от возраста токена.
- [ ] `OAuthAccount` и `PasswordReset` этой учётки удалены (иначе повторный вход через Яндекс
      воскресит доступ через ступень 1 матчинга).
- [ ] `claimToken` на связанных `Deal`/`RepairOrder`/`PartShipment`/`RentalBooking` занулён;
      старая ссылка `/estimate/<token>` отдаёт 404 (ручная проверка).
- [ ] ADMIN пересоздаёт учётку тому же человеку → новый `Account.id`, временный пароль по SMS,
      вход работает, история на месте.
- [ ] Ре-backfill (`scripts/backfill-accounts.ts`) **не** воссоздаёт учётку с тумбстоуном.
- [ ] `disableAccount` → `enableAccount` **сохраняет исходную роль** (тест: MANAGER остаётся
      MANAGER, сегодня становится CLIENT).
- [ ] Нельзя заблокировать/удалить себя и последнего ADMIN (тесты).
- [ ] Гостевой claim при отсутствующем `Account` создаёт учётку и логинит (тест + ручная проверка
      по ссылке из письма).
- [ ] P2002 на `loginEmail` в claim → внятное сообщение, не необработанное исключение.
- [ ] Флага `ACCOUNT_AUTH_READS` и legacy-веток чтения в коде **нет** (grep).
- [ ] Verify: `npx vitest run` + `npm run build` + браузер: полный цикл удалить → войти нельзя →
      пересоздать → войти можно, на живой тестовой записи.

---

### Story 6: Разведение архива — `CustomerProfile.archivedAt` / `Account.disabledAt`

**Objective:** «скрыт из CRM» и «не может войти» становятся разными операциями.

**Миграции нет** (колонка `archivedAt` создана и наполнена в M1; поле `MasterProfile.isActive`
уже существует в схеме).

**Files:**
- Modify: `lib/customer-queries.ts:56-62` — фильтр по `customerProfile.archivedAt`,
  **через `OR` с `{ customerProfile: null }`**.
- Modify: `app/actions/crm/customers.ts:51-54,75-78` — `deleteCustomer`/`restoreCustomer` пишут
  `archivedAt` (**upsert**, не update) + гасят/поднимают `Account`.
- Modify: `lib/email/resolve.ts` (три места, читающие `deletedAt`).
- Modify: `app/(admin)/admin/customers/[id]/page.tsx:184-188,290-309` — баннер и «Опасная зона».
- Modify: `components/admin/customers/DeleteCustomerButton.tsx:21-24` — текст, который до сих пор
  обещает безвозвратное удаление гостей (hard delete убран ещё в `6e0ffe6`).
- Modify: `app/api/admin/customers/search/route.ts`, `app/(admin)/admin/crm/deals/page.tsx`,
  `app/(admin)/admin/roles/page.tsx` — сверить, какое поле им нужно.
- Modify: `tests/email/mail-resolution.test.ts:435-529` — 5 тестов переезжают на новое поле.

**Key decisions:**
- **Требует явного решения владельца, и оно записывается в план перед стартом стори:** сегодня
  архивирование клиента **разлогинивает** его (`lib/auth.ts:73`). После разведения это два разных
  действия. Дефолт плана — **сохранить сегодняшнее поведение**: `deleteCustomer` пишет `archivedAt`
  **и** ставит `Account.status = DISABLED` с `disabledReason = "CUSTOMER_ARCHIVED"`. В UI —
  две галочки, чтобы оператор мог архивировать, не выгоняя.
- **Архив — свойство роли.** Клиент → `CustomerProfile.archivedAt`. Персонал → `MasterProfile.isActive`
  (поле уже есть). Поставщик → `SupplierProfile.isActive` (уже есть). `User.deletedAt` остаётся
  как есть и **не дропается** (см. Out of Scope): его читают 12 файлов, включая guard последнего
  админа в `purgeEmptyUser` (`user-management.ts:106`) и `app/(admin)/admin/roles/page.tsx`.
  Проверено grep'ом; `app/actions/team.ts` в репозитории **не существует** — команда живёт
  в `app/actions/team-members.ts` и `deletedAt` не читает.
- **[РИСК: `archivedAt` пустой у тех, кого архивировали между M1 и этой стори]** Порт
  `credentials.ts` пишет `archivedAt` парно с `deletedAt` начиная со Story 2. Перед флипом —
  обязательный ассерт: `count(User.deletedAt IS NOT NULL) = count(CustomerProfile.archivedAt IS NOT NULL)`
  среди `isCustomer`.
- **[РИСК: фильтр `customerProfile.archivedAt: null` молча теряет клиентов без строки профиля]**
  Профили добиты в M1, но фильтр всё равно пишется с `OR { customerProfile: null }` — тот же
  defense-in-depth, что уже применён для `blacklist` в `lib/customer-queries.ts:70-77`.
- Одна операция — два поля (`archivedAt` + `Account.status`). Чтобы они не разъехались от будущих
  правок, обе записи идут **только** через порт, есть тест на парность и ассерт в
  `verify-account-mirror`.

**DoD:**
- [ ] Архивированный клиент не виден в `/admin/customers`, в поиске, в CSV-экспорте;
      клиент **без строки `CustomerProfile`** виден (регрессия закрыта тестом).
- [ ] Архивирование гасит вход (дефолт), но галочка «только скрыть из CRM» оставляет вход рабочим.
- [ ] Восстановление возвращает и видимость, и вход.
- [ ] Входящее письмо от архивированного клиента уходит в триаж `InboxMessage(PENDING)` — как
      сегодня (5 переписанных тестов зелёные).
- [ ] Заблокированный, но не архивированный клиент **виден** в CRM (новое поведение, проверить).
- [ ] Тексты «Опасной зоны» и `DeleteCustomerButton` соответствуют реальности (архивирование,
      не безвозвратное удаление).
- [ ] Verify: `npx vitest run tests/email` + `npm run build` + браузер: архивировать → проверить
      списки/поиск/вход → восстановить.

---

### Story 7: Смена логина отдельно от CRM-контактов + ревокация сессий  ← ЦЕЛЬ 2

**Objective:** сменить человеку email в CRM, не сломав ему вход; сменить логин, не тронув
CRM-контакты. Ради этого задача и ставилась.

**Миграции нет.**

**Files:**
- Modify: `app/actions/user-management.ts:192-238` (`updateUserContacts`) — правит **только**
  `User.name/email/phone`.
- Modify: `app/actions/customers.ts:186-199` (`updateCustomer`) — то же.
- Create: `app/actions/account-login.ts` — `changeAccountLogin(userId, {loginEmail, loginPhone})`,
  ADMIN; `revokeAllSessions(userId)`.
- Modify: `components/admin/UserAdminActions.tsx` — отдельный блок «Логин», отдельный «Контакты».
- Modify: `scripts/verify-account-mirror.ts` — разделить проверки (см. Key decisions).
- Create: `tests/accounts/login-change.test.ts`.

**Key decisions:**
- **Здесь и только здесь снимается «обратная запись» логин-колонок.** До этой стори порт держал
  `Account.loginEmail === User.email`; теперь дивергенция разрешена и является целью.
  `Account.passwordHash`/`isTempPassword` продолжают зеркалиться до Story 9 — они и есть страховка
  отката.
- **[РИСК: `updateUserContacts`/`updateCustomer` тихо перестают менять логин]** Оператор меняет
  email в карточке клиента и искренне не понимает, почему человек входит по старому. Лечение —
  UI: два разных блока с разными подписями («Контакты клиента (CRM)» / «Логин для входа»)
  и предупреждение в форме контактов «на вход не влияет». Плюс на карточке видно оба значения,
  когда они разошлись.
- **[РИСК: drift-чек начинает шуметь ровно тогда, когда он нужен]** `verify-account-mirror`
  сравнивал `u.email <> a.loginEmail` как признак дрейфа — с этой стори расхождение легитимно.
  Проверки разделяются: **инварианты существования/владения** (у каждого не-поставщика 0..1
  `Account`; нет `OAuthAccount`/`PasswordReset` с `NULL accountId` при существующем `Account`;
  нет `Account` с несуществующим `userId`; `Account.permissionRole = User.permissionRole`) —
  навсегда; **проверки равенства логин-колонок** — только до этой стори, затем автоматически
  отключаются по дате.
- `changeAccountLogin` бампает `sessionVersion` → человек разлогинивается на всех устройствах.
  То же для смены пароля. Появляется кнопка «Выйти на всех устройствах».
- Нормализация обязательна и **едина**: `loginEmail` — `trim().toLowerCase()`, `loginPhone` —
  `normalizePhone`. **До** этой стори выполнить на проде
  `SELECT lower(email), count(*) FROM "User" GROUP BY 1 HAVING count(*) > 1` — если два `User`
  различаются только регистром, уникальный индекс `Account_loginEmail_key` конфликтует, и это
  надо разрулить руками (или через Story 8).

**DoD:**
- [ ] Смена `User.email` в карточке клиента **не** меняет логин; человек входит по старому email.
- [ ] `changeAccountLogin` меняет вход; старый email больше не пускает; новый — пускает.
- [ ] Смена логина и смена пароля разлогинивают все устройства (тест на `sessionVersion`).
- [ ] P2002 на занятом `loginEmail`/`loginPhone` → внятное сообщение, не 500.
- [ ] `verify-account-mirror` после дивергенции даёт 0 нарушений инвариантов и **не** сообщает
      о расхождении логина как об ошибке.
- [ ] UI: два визуально разделённых блока; при расхождении оба значения показаны на карточке.
- [ ] Verify: `npx vitest run` + `npm run build` + браузер: сменить CRM-email → войти по старому
      логину; сменить логин → войти по новому, старый отвергнут; проверить, что вторая сессия
      в другом браузере выкинута.

---

### Story 8: Слияние дублей клиентов  ⚠️ GATED (destructive, необратимо)  ← ЦЕЛЬ 3

**Objective:** человек завёлся дважды (сменил email/телефон, оформил заказ на новый адрес) —
слить в одного, перенеся все бизнес-FK и дедуплицировав контакты. Исходная боль владельца:
без merge «смена email» порождает второго клиента с половиной истории.

**Миграция:** `prisma/migrations/2026xxxxxxxxxx_user_merge/migration.sql` — **АДДИТИВНАЯ**:
`User.mergedIntoUserId` (self-FK `ON DELETE SET NULL`) + индекс, таблица `UserMergeLog`,
`ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL`.

**Files:**
- Modify: `prisma/schema.prisma`; Create: миграция (руками).
- Create: `app/actions/crm/merge-customers.ts` — `getMergePreview`, `mergeCustomers`.
- Create: `components/admin/customers/MergeCustomersDialog.tsx`.
- Modify: `app/(admin)/admin/customers/[id]/page.tsx` — кнопка «Объединить с…», баннер и redirect
  для поглощённой строки.
- Create: `tests/crm/merge-customers.test.ts`.
- Create: `scripts/unmerge-customers.ts` — обратный скрипт по `UserMergeLog` (пишется **до**
  первой выкатки, не после).

**Key decisions:**
- **Предполётное превью обязательно.** `getMergePreview` показывает точные счётчики того, что
  переедет, и запрещает merge, если дубль несёт штатные/поставщицкие рёбра: `masterProfile`,
  `supplierProfile`, `supplierOrders`, `dealsAsOwner`, `estimatesPrepared`, `commLogsAuthored`,
  `authoredCustomerNotes`, `crmTasksOwned`, `mailIdentities`, `assignedInboxMessages`,
  `assignedRepairOrders`, `assignedLaborLines`, `uploadedImages`, `uploadedRepairOrderPhotos`,
  `blogPosts`, `settingsUpdated`. Слияние сотрудников — другая задача.
- **Простой перенос `updateMany` source → target:** `Vehicle.ownerUserId`, `RepairOrder.userId`,
  `PartShipment.userId`, `RentalBooking.userId`, `Deal.customerUserId`,
  `CommunicationLog.customerUserId`, `CrmTask.customerUserId`, `CustomerNote.customerUserId`,
  `Notification.userId`, `User.referredById`.
- **Три места, где наивный `updateMany` падает на уникальности — проверено по схеме:**
  1. `CustomerTagAssignment` — составной PK `@@id([customerUserId, tagId])`. Сначала `deleteMany`
     у дубля тегов, которые уже есть у цели, потом `updateMany`.
  2. `CustomerContact` — `@@unique([type, value])` (`schema.prisma:479`). Сначала `deleteMany`
     конфликтующих у дубля, потом `updateMany`. Затем `createMany({skipDuplicates: true})` добавляет
     цели алиасы из **собственных primary-контактов** дубля (`source.email`, `source.phone`) —
     иначе входящая почта со старого адреса перестанет резолвиться на объединённого клиента
     (`lib/email/resolve.ts` читает именно `CustomerContact`).
  3. `LoyaltyAccount` — `userId @unique`. Не переносим строку, а **вливаем**: `target.points +=
     source.points`, `loyaltyTransaction.updateMany({accountId: source → target})`, затем
     `loyaltyAccount.delete(source)`. `referralCode @unique` дубля теряется — фиксируется в snapshot.
- `CustomerProfile` (PK = `userId`, 1:1) — слияние полей, не переезд строки: `lifetimeValue +=`,
  `firstSeenAt = LEAST`, `lastTouchAt = GREATEST`, `blacklisted = OR`, `notes` — конкатенация
  с разделителем, `source`/`preferredMasterUserId` — `target ?? source`. Затем удаление профиля дубля.
- **Учётка:** `keepAccount: 'target' | 'source'`. Если оставляем учётку дубля — `account.update`
  на `userId: target` (предварительно погасив учётку цели тумбстоуном), плюс `updateMany`
  по `OAuthAccount`/`PasswordReset`. Обе ветки бампают `sessionVersion`.
- **Tombstone дубля обязателен**, иначе его email/phone навсегда заняты уникальными индексами
  `User`: `email = 'merged-' + source.id + '@invalid.local'` (cuid глобально уникален → коллизия
  невозможна), `phone = null` (ради этого и `DROP NOT NULL`), `deletedAt = now()`,
  `mergedIntoUserId = target.id`.
- **`ALTER COLUMN "phone" DROP NOT NULL` необратим после первого слияния** — план это признаёт
  явно. Расширение типа обратно совместимо: старый код телефон всегда пишет, `NULL` появится
  только у поглощённых строк, которые войти уже не могут.
- **Merge необратим миграцией.** Поэтому `UserMergeLog` (счётчики + snapshot контактов дубля)
  и `scripts/unmerge-customers.ts` пишутся **в этой же стори, до выкатки**. Плюс `customerNote`
  на цели «Объединён дубль <имя, email, телефон>» — попадает в CRM-таймлайн бесплатно.
- Карточка дубля показывает баннер «Объединён с <ссылка>» и делает `redirect` на цель;
  `lib/customer-queries.ts` уже фильтрует архивных, так что из списков дубль исчезает сам.

**DoD:**
- [ ] Превью показывает точные счётчики (заказы, сделки, авто, коммуникации, баллы) и совпадает
      с фактически перенесённым.
- [ ] Merge отказывает, если дубль несёт хоть одно штатное/поставщицкое ребро (тест на каждое).
- [ ] Три коллизионных случая покрыты тестами: пересекающиеся теги, пересекающиеся контакты,
      два `LoyaltyAccount` (баллы суммируются, транзакции переехали, строка дубля удалена).
- [ ] Повторный вызов `mergeCustomers` на уже слитой паре — идемпотентен (отказ, не порча).
- [ ] После merge: email дубля свободен для нового человека; телефон дубля свободен.
- [ ] Входящее письмо со **старого** адреса резолвится на объединённого клиента (алиас создан).
- [ ] `scripts/unmerge-customers.ts` восстанавливает состояние по `UserMergeLog` на тестовой БД.
- [ ] `RepairOrder`/`Deal`/`CommunicationLog` не потеряны: `count(target)` после = сумма до.
- [ ] Verify: `npx vitest run` + `npm run build` + браузер: слить два реальных тестовых клиента,
      проверить карточку цели (все заказы, авто, баллы), карточку дубля (баннер + redirect),
      попробовать войти под старым логином дубля.

---

### Story 9: M2 CONTRACT — снос зеркал  ⚠️ GATED (необратимо)

**Objective:** убрать колонки, которые больше никто не читает.

**Миграция:** `prisma/migrations/2026xxxxxxxxxx_account_contract/migration.sql` — **CONTRACT,
НЕОБРАТИМА**. Выкатывается **отдельным** деплоем, вручную, в окно низкой нагрузки.

**ПРЕДУСЛОВИЯ (все обязательны):**
1. Story 5–7 отработали на проде **≥2 недели**.
2. `verify-account-mirror` = 0 нарушений инвариантов на протяжении всего периода.
3. `grep -rn "passwordHash\|isTempPassword" app lib components --include="*.ts" --include="*.tsx"`
   (без `app/generated`) даёт **только** `Account`-контексты.
4. Снят `pg_dump` всей БД непосредственно перед накатом; процедура восстановления **отрепетирована**
   на копии (прод-БД снаружи недоступна — репетировать в момент аварии негде).

**SQL (порядок обязателен):**

```sql
-- 0) Физический архив ДО любого дропа: превращает "восстановление из бэкапа" в "прогнать скрипт"
CREATE TABLE "_user_credentials_archive" AS
  SELECT id, "passwordHash", "isTempPassword", now() AS "archivedAt" FROM "User";

-- 1) Висячие креденшел-строки (принадлежали людям без Account) — иначе SET NOT NULL упадёт
DELETE FROM "OAuthAccount"  WHERE "accountId" IS NULL;
DELETE FROM "PasswordReset" WHERE "accountId" IS NULL;
ALTER TABLE "OAuthAccount"  ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "PasswordReset" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "OAuthAccount"  DROP CONSTRAINT "OAuthAccount_userId_fkey",  DROP COLUMN "userId";
ALTER TABLE "PasswordReset" DROP CONSTRAINT "PasswordReset_userId_fkey", DROP COLUMN "userId";

-- 2) Зеркальные креденшел-колонки
ALTER TABLE "User" DROP COLUMN "passwordHash", DROP COLUMN "isTempPassword";
```

**НЕ делаем** (см. Out of Scope): `DROP COLUMN "User"."deletedAt"`,
`DROP COLUMN "User"."permissionRole"`, `DROP INDEX "User_email_key"/"User_phone_key"`,
обмен enum-типа ради удаления `NONE`.

**Files:**
- Modify: `prisma/schema.prisma`; Create: миграция (руками).
- Modify: `lib/accounts/credentials.ts` — убрать обратную запись кредов.
- Modify: `prisma/schema.prisma` комментарии `:337-340` и `:358-361` (устарели: обещают hard delete
  гостей, которого нет с `6e0ffe6`).
- Modify: `app/actions/crm/customers.ts:13-17` — тот же устаревший комментарий.
- Modify: `scripts/verify-account-mirror.ts` — снять проверки равенства кредов.

**Key decisions:**
- **[РИСК CRITICAL: `SET NOT NULL` падает на NULL-строках → `P3009` блокирует ВСЕ будущие деплои]**
  Разбор: `request-password-reset.ts:43` и `lib/oauth-login.ts:70-72` создают строки только
  с `userId`; у людей без `Account` (поставщики, удалённые учётки) `accountId` остаётся `NULL`.
  Без шага 1 миграция падает, в `_prisma_migrations` остаётся проваленная строка, и каждый
  следующий `migrate deploy` отказывается работать. **До Story 0** это ещё и означало бы, что
  приложение продолжает подниматься (`|| echo`) — но fail-fast из Story 0 закрывает вторую половину
  риска. Обе меры нужны: `DELETE` висячих строк здесь + fail-fast там.
- Дополнительно **перед** накатом: запретить коду создавать `PasswordReset`/`OAuthAccount` без
  `accountId` (сделано в Story 2 через порт) и проверить
  `SELECT count(*) FROM "OAuthAccount" WHERE "accountId" IS NULL` — если строк много, разобраться,
  а не удалять вслепую.
- Contract выполняется **вручную**, а не автостартом: `npm start` теперь fail-fast, и уронить
  подъём прода необратимой миграцией — худший сценарий. Накат: остановить деплой, выполнить
  `prisma migrate deploy` руками, убедиться, поднять.
- Эта стори **опциональна по сути**: система достигает всех трёх целей владельца уже после Story 8.
  Contract нужен только для чистоты и экономии полей. Если сомнения есть — не делать.

**DoD:**
- [ ] `pg_dump` снят, восстановление отрепетировано на копии, отчёт записан в Verification Evidence.
- [ ] `SELECT count(*)` по висячим `accountId IS NULL` зафиксирован в комментарии миграции
      **до** `DELETE`.
- [ ] `_user_credentials_archive` создана и содержит `count(User)` строк.
- [ ] `npx prisma migrate deploy` прошёл, `_prisma_migrations` без проваленных строк.
- [ ] Вход паролем, вход через Яндекс, сброс по SMS, гостевой claim — все четыре работают
      (браузер, сразу после наката).
- [ ] `npx vitest run` + `npm run build` зелёные.
- [ ] Устаревшие комментарии в схеме и `crm/customers.ts` приведены в соответствие коду.

---

### Story 10 (ОПЦИОНАЛЬНАЯ): `permissionRole` переезжает на `Account`

**Objective:** закрыть остаточную нечистоту — «удалил учётку админа, завёл заново → он снова ADMIN».

**Миграций нет** (колонка `Account.permissionRole` заведена и наполнена в M1; `SET NOT NULL` —
опционально, отдельной микро-миграцией).

**Key decisions:**
- Замер, который надо знать перед решением: `requireRole` — **185 вызовов в 71 файле**, но все
  читают `session.permissionRole` из `getSession()`. Обращений к `User.permissionRole` на уровне
  БД — **~17** (`user-management.ts` ×10, `customer-onboarding.ts`, `oauth-complete.ts`,
  `oauth-login.ts`, `lib/auth.ts`, `admin/roles/page.tsx`, `admin/users/page.tsx`,
  `lib/crm/auto-task.ts`). Это работа на ~17 мест, а не на 185. Исходная оценка «247 обращений»
  завышена примерно в 15 раз и не должна быть аргументом ни за, ни против.
- Край, требующий решения: если роль живёт на `Account`, то у человека **без** `Account` роли нет —
  `changeUserRole` для такого становится невыразим. Варианты: (а) роль на `Account`, а для
  человека без учётки роли просто не существует (правильно, но требует правки UI `/admin/users`,
  который сегодня жёстко фильтрует `isSupplier: false`); (б) оставить как есть.
- Флаг `ACCOUNT_ROLE_READS` по образцу Story 4 (env-first + break-glass).

**DoD:**
- [ ] Все ~17 БД-сайтов переведены; `session.permissionRole` берётся с `Account`.
- [ ] Удаление учётки админа → пересоздание → роль **не** восстанавливается автоматически.
- [ ] Guard последнего ADMIN считает по `Account`, а не по `User` (иначе счёт разъедется).
- [ ] Все 185 `requireRole` работают без правок (тест на выборке из 10 маршрутов).
- [ ] Verify: `npx vitest run` + `npm run build` + браузер: вход под каждой из 6 ролей,
      доступ к соответствующим разделам.

---

## Rollback Plan

**Общий принцип:** до Story 9 откат любой стори — это редеплой предыдущего образа плюс, при
необходимости, один `DROP`. Зеркальные колонки `User` актуальны на протяжении Story 2–8, поэтому
старый код всегда находит рабочие данные.

| Стори | Откат | Стоимость | Потеря данных |
|---|---|---|---|
| 0 | `git revert` одного коммита | минуты | нет |
| 1 | `git revert` | минуты | нет |
| 2 | Редеплой + `DROP TABLE "Account"; DROP TYPE "AccountStatus"; ALTER TABLE ... DROP COLUMN "archivedAt","accountId";` | минуты | нет — ни одна существующая колонка не изменена |
| 3 | Редеплой | минуты | нет — толерантность работает в обе стороны, лишние клеймы игнорируются старым `verifyToken` |
| 4 | **Без деплоя:** `ACCOUNT_AUTH_LEGACY=1` (мгновенно, break-glass) → `scripts/toggle-account-flag.ts` → `Setting` (до 60 с на процесс) | секунды–минута | нет |
| 5 | Редеплой | минуты | **есть:** учётки, удалённые/заблокированные новым способом, после отката требуют ручного `resetUserPassword`; `claimToken`, занулённые при удалении, не восстанавливаются |
| 6 | Редеплой | минуты | нет — `deletedAt` продолжает писаться парно |
| 7 | Редеплой + разовый ре-синк `UPDATE "User" SET email = a."loginEmail" ...` | минуты | **есть:** логины, разошедшиеся с CRM-контактами, при откате «схлопываются» обратно; список расхождений снять **до** отката |
| 8 | Редеплой + `scripts/unmerge-customers.ts` по `UserMergeLog` | часы | **есть:** `referralCode` дубля, `phone NOT NULL` не возвращается |
| 9 | **Восстановление из `_user_credentials_archive` скриптом + `ADD COLUMN`**; при неудаче — `pg_dump` | часы | **есть:** удалённые висячие `OAuthAccount`/`PasswordReset` |

**Аварийная тотальная ревокация сессий** на любом этапе — ротация `JWT_SECRET` (штатный
задокументированный механизм, `lib/settings.ts:42`; секрет намеренно **не** вынесен в таблицу
`Setting`). Цена — разлогин всех пользователей. Записать в runbook, а не изобретать в момент инцидента.

**Что делает откат невозможным (красные линии):**
- Story 9 после `DROP COLUMN` — только восстановление из архивной таблицы или дампа.
- Story 8 после первого слияния — `phone NOT NULL` не возвращается; данные — только `unmerge`-скриптом.
- Любая ситуация, где `prisma migrate deploy` оставил проваленную строку в `_prisma_migrations`
  (`P3009`): следующий деплой не пройдёт. Разбирать вручную, не накатывать «поверх».

**Порядок при инциденте «сломался вход» (runbook):**
1. `ACCOUNT_AUTH_LEGACY=1` в env → перезапуск процесса (или мгновенно, если читается на каждый вызов).
2. Если не помогло — редеплой предыдущего образа.
3. Если и это не помогло — ротация `JWT_SECRET` (все разлогинены, но вход работает).
4. Только после восстановления — разбор по логам и `verify-account-mirror`.

## ОТВЕТЫ ВЛАДЕЛЬЦА (2026-07-31) — вопросы закрыты

**1. Архивирование = скрыт из CRM И не может войти.** Подтверждено, галочка «только скрыть» не нужна.

Владелец добавил модель, которой в плане не было: **аккаунт и клиент — соответствие 1:1**.
Блокируем аккаунт → клиент блокируется автоматически, отдельного действия «заблокировать клиента» нет.

⚠️ Это НЕ совпадает с исходной формой из консультации codex, где `Account` принадлежит `User/Party`
именно потому, что один человек может быть одновременно клиентом и мастером. Если связь строго 1:1
с клиентом, нужно решить, что происходит с сотрудником, который сам обслуживается в сервисе.
**Требует уточнения до Story 2** (форма таблицы), но не блокирует Story 0–1.

**2. Удалил учётку → человек снова заходит через Яндекс = создаётся НОВАЯ учётка.**
Автопривязка к старым данным по совпадению email ЗАПРЕЩЕНА. Основание владельца подтверждено кодом:
**подтверждения email в системе нет** (поиск `emailVerified`/`verifyEmail`/`verificationToken` —
пусто), поэтому совпадение адреса не доказывает, что это тот же человек. Привязка старых сделок —
только вручную оператором.

Это ужесточает Story 1: автопривязка ограничивается не только ролью `CLIENT`, но и вовсе
не должна воскрешать данные удалённой учётки.

**3. Пересозданная учётка = права обычного пользователя. Вариант Б — Story 10 становится
ОБЯЗАТЕЛЬНОЙ,** `permissionRole` переезжает на `Account`. Нет учётки — нет роли; админом назначают
вручную. Замер: ~17 мест чтения роли из БД (не 247).

**4. НОВОЕ ТРЕБОВАНИЕ — при удалении клиента сделки НЕ удалять, а ОТВЯЗЫВАТЬ**
(с возможностью привязать обратно вручную).

Замер выполнимости: `Deal.customerUserId` и `RepairOrder.userId` сейчас **NOT NULL**, отвязать
физически нельзя. Требуется миграция на nullable + правка потребителей: **248 обращений в 40 файлах**
читают `customerUserId`/`deal.customer` и предполагают, что клиент есть всегда.

⚠️ **Расхождение с продом:** выкаченное 2026-07-30 удаление (`app/actions/crm/customer-erase.ts`)
сделки **удаляет**. До реализации отвязки оно противоречит этому решению: данные останутся только
в выгруженном JSON и вернуть их в систему будет нельзя. Решить, что делать в переходный период
(см. раздел ниже).

## Открытые вопросы к владельцу (исходные формулировки, оставлены для истории)

1. **Архивирование клиента должно выгонять его из системы?** Дефолт плана — да (как сегодня),
   плюс галочка «только скрыть из CRM». Подтвердить.
2. **После удаления учётки вход через Яндекс по тому же email должен создавать новую учётку
   автоматически?** Сегодня ступени 2/3 матчатся по контактам, то есть удаление обратимо силами
   самого пользователя. Дефолт плана — сохранить это поведение (менять его — изменение UX,
   не связанное с задачей). Альтернатива: отдавать `pending` и требовать явной регистрации.
3. **Роль при пересоздании учётки.** Сегодня она на `User` и переживает удаление (админ остаётся
   админом). Оставляем так (Story 5 показывает роль в диалоге) или делаем Story 10?
