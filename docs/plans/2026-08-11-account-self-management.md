# Управление аккаунтом в профиле клиента — Implementation Plan

Created: 2026-08-11
Status: VERIFIED
Mode: auto
Iterations: 1
Type: Feature

## Контекст

Запрос владельца: «Добавь возможность пользователям платформы нормально управлять
своим аккаунтом в профиле как это должно быть. Определи какого функционала не
хватает, потом сделай его.»

### Что уже есть (разведка 2026-08-11)

- `/profile` (app/profile/page.tsx): имя, email, телефон, часовой пояс, язык
  (updateOwnProfile в app/actions/profile.ts); staff-блоки уведомлений/Telegram.
- Восстановление пароля по SMS-коду (request/confirm-reset-password,
  lib/password-reset/core.ts — код хэширован, rate limit есть).
- Email-верификация: модель + resendEmailVerificationAction +
  components/cabinet/EmailVerificationNotice.tsx (показывается в кабинете,
  но в профиле статуса email НЕТ).
- Сессия: JWT 7d в httpOnly cookie (lib/auth.ts), stateless — отозвать нельзя.
- Soft-delete пользователей есть (User.deletedAt, getSession его уважает),
  но только руками админа.

### Чего не хватает (решение)

1. Смена пароля из профиля (сейчас прямо написано «пароль сбрасывается через
   вход» — для залогиненного это абсурдный маршрут).
2. Отзыв сессий: «выйти на всех устройствах» + автоматическая инвалидация
   всех сессий при смене пароля (JWT нужен механизм ревокации).
3. Статус подтверждения email в профиле + повторная отправка письма.
4. Удаление аккаунта самим клиентом (danger zone, с подтверждением паролем,
   soft-delete — история CRM сохраняется).

Вне скоупа (отмечено как будущее): журнал входов/lastLoginAt, аватар,
двухфакторка.

## Progress Tracking

- [x] Story 1: Смена пароля в профиле (блок «Безопасность») (Status: VERIFIED)
- [x] Story 2: Отзыв сессий — «выйти на всех устройствах» + инвалидация при смене пароля (Status: VERIFIED)
- [x] Story 3: Статус email в профиле + самостоятельное удаление аккаунта (Status: VERIFIED)

## Implementation Tasks

### Story 1: Смена пароля в профиле

**Objective:** Залогиненный пользователь меняет пароль, зная текущий.

**Files:**
- `app/actions/profile.ts` — новый server action `changeOwnPassword(_prev, formData)`:
  requireAuth → загрузить passwordHash+isTempPassword; если passwordHash NULL или
  isTempPassword=true → ошибка «Пароль ещё не задан — установите его через
  восстановление» (гостевой хэш пользователю неизвестен); bcrypt.compare текущего;
  новый ≥ 6 символов (симметрично confirm-reset-password), новый ≠ текущий;
  bcrypt.hash(_, 12); update.
- `components/profile/ChangePasswordForm.tsx` — client, useActionState, 3 поля
  (текущий, новый, повтор нового — совпадение проверяется и на сервере).
- `app/profile/page.tsx` — карточка «Безопасность» с формой; убрать сноску
  «пароль сбрасывается через вход».

**DoD:** tests/profile/change-password.test.ts: неверный текущий, короткий новый,
несовпадающий повтор, гостевой isTempPassword, NULL passwordHash, успех
(bcrypt-хэш пишется, не plaintext). tsc + vitest зелёные.

### Story 2: Отзыв сессий

**Objective:** «Выйти на всех устройствах» из профиля; смена пароля
автоматически разлогинивает все остальные устройства; текущая сессия живёт.

**Files:**
- `prisma/schema.prisma` — `User.sessionsRevokedAt DateTime?`; миграция РУКАМИ
  (migrate dev сломан дрейфом): mkdir prisma/migrations/<ts>_user_sessions_revoked_at
  + SQL + `npx prisma db execute --file` + `npx prisma migrate resolve --applied`
  + `npx prisma generate`. В SQL — только ALTER TABLE, никакого дрейфа.
- `lib/auth.ts` — JWTPayload получает `iat` (jsonwebtoken ставит сам);
  getSession дополнительно select sessionsRevokedAt и отклоняет токен, если
  `payload.iat < floor(sessionsRevokedAt.getTime()/1000)` (посекундное сравнение:
  токен, перевыпущенный в ту же секунду, остаётся валидным).
- `app/actions/profile.ts` — action `revokeOtherSessions`: set sessionsRevokedAt=now,
  затем createToken+setSessionCookie заново (текущее устройство переживает отзыв);
  `changeOwnPassword` делает то же самое после смены хэша.
- `app/profile/page.tsx` / ChangePasswordForm — кнопка «Выйти на всех устройствах»
  в карточке «Безопасность».

**DoD:** тесты: токен старше sessionsRevokedAt отклонён, той же секунды — валиден,
NULL — валиден; revokeOtherSessions перевыпускает cookie; смена пароля ставит
sessionsRevokedAt. Полный гейт.

### Story 3: Статус email + удаление аккаунта

**Objective:** В профиле виден статус подтверждения email с повторной отправкой;
клиент может удалить свой аккаунт сам.

**Files:**
- `app/profile/page.tsx` — блок статуса email (✓ подтверждён <дата> / не
  подтверждён + кнопка повторной отправки через существующий
  resendEmailVerificationAction; переиспользовать/адаптировать
  components/cabinet/EmailVerificationNotice.tsx).
- `app/actions/profile.ts` — action `deleteOwnAccount(_prev, formData)`:
  только permissionRole=CLIENT (staff → ошибка «учётку сотрудника удаляет
  администратор»); подтверждение паролем (bcrypt.compare; isTempPassword/NULL →
  ошибка); soft-delete `deletedAt=now` (история CRM цела — паттерн админского
  удаления), clearSessionCookie, redirect("/").
- `components/profile/DeleteAccountForm.tsx` — «Опасная зона»: раскрываемое
  подтверждение с полем пароля, красная кнопка.

**DoD:** тесты: staff отклонён, неверный пароль отклонён, CLIENT с верным паролем
→ deletedAt проставлен + cookie снят; getSession с deletedAt уже возвращает null
(покрыто существующей логикой — проверить тестом). Полный гейт + ручная проверка
вёрстки обеих карточек.

## Verification (initiative)

- `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` — всё зелёное.
- Прод после деплоя: /profile за авторизацией, публичные страницы 200.
