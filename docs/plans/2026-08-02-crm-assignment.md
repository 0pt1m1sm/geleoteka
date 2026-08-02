# CRM Assignment Implementation Plan

Created: 2026-08-02
Status: IN_PROGRESS
Mode: auto
Iterations: 0
Type: Feature

Запрос владельца (вечер 02.08): (1) назначение ответственного за задачу в
CRM — бэкенд готов (`CrmTask.ownerUserId`, экшен читает поле), нет UI;
(2) менеджер в карточке клиента — сущности нет вовсе; (3) уведомление
«Задача назначена». Скан просрочек в воркер — владелец НЕ выбрал, не делать.

Инварианты: миграции руками + `migrate deploy`, без дрейфа
(Part_photos_gin_idx, Vehicle_photos_gin_idx, StockMovement); политика
Telegram-содержимого — в тексте уведомления можно имя клиента и номер
сделки, НЕЛЬЗЯ заголовок/тело задачи (пользовательский ввод); prisma-клиент
из `@/app/generated/prisma/client`.

## Progress Tracking

- [ ] Story 1: Селектор ответственного в форме задачи + валидация в экшене   (Status: PENDING)
- [ ] Story 2: Менеджер клиента (поле, карточка, приоритет в роутинге «Клиент написал»)   (Status: PENDING)
- [ ] Story 3: Тип уведомления TASK_ASSIGNED «Задача назначена»   (Status: PENDING)
- [ ] Story 4: Типы «по максимуму»: USER_LOGIN (вход в платформу), TASK_CREATED (новая задача)   (Status: PENDING)
- [ ] Story 5: Ревизия аудита: все основные действия пишутся в AuditLog   (Status: PENDING)

## Implementation Tasks

### Story 1: Селектор ответственного в форме задачи

Objective: при создании задачи можно выбрать исполнителя из сотрудников;
пусто = на себя (текущее поведение). Экшен валидирует, что ownerUserId —
существующий сотрудник (сейчас принимает любую строку).
Files: форма «Новая задача» (components/admin/crm/…), страница задач
(передать список сотрудников), `app/actions/crm/tasks.ts`.
DoD: селектор в форме (ADMIN/MANAGER), пусто → на себя; чужой/битый id →
понятная ошибка; список задач показывает исполнителя; тесты экшена
(валидация владельца) RED→GREEN; tsc/lint/build.

### Story 2: Менеджер клиента

Objective: у клиента есть персональный менеджер; «Клиент написал» идёт
лично менеджеру в первую очередь.
Files: `prisma/schema.prisma` (User.managerUserId, self-relation, SetNull) +
миграция `2026080XXXXXXX_customer_manager`; карточка клиента (селектор,
server action с requirePermission("crm.manage") + AuditLog); роутинг
кандидатов INBOUND_CUSTOMER_MESSAGE (менеджер клиента → текущая логика).
DoD: миграция применена локально, `migrate diff` чист от нового дрейфа;
назначение/снятие менеджера в карточке работает и пишет AuditLog; тест
роутинга: у клиента с менеджером personal-кандидат — менеджер; без —
прежняя логика; tsc/lint/build.

### Story 3: Тип уведомления «Задача назначена» (TASK_ASSIGNED)

Objective: когда задачу ставит/переназначает кто-то другой, исполнитель
получает уведомление; себе — не шлётся.
Files: `lib/staff-notifications/types.ts` (catalog: label «Задача
назначена», priority P1, fallbackPermission crm.manage), publish.ts
(publishTaskAssigned с dedupeKey task+owner), проектор
(ROUTABLE_EVENT_SOURCE_TYPES: TASK_ASSIGNED→CrmTask; personal-кандидат —
исполнитель), telegram format (текст: «Вам назначена задача», имя клиента и
срок; БЕЗ заголовка задачи — пользовательский ввод), `app/actions/crm/tasks.ts`
(publish при создании с чужим owner и при claim/переназначении).
DoD: тумблер типа появился в сетке и профиле автоматически; тесты
RED→GREEN: назначение другому публикует событие, себе — нет; формат без
title; роутинг лично исполнителю; tsc/lint/build; migrate diff чист.

### Story 4: Типы событий «по максимуму»

Objective (запрос владельца 02.08 поздний вечер): «когда включены все —
фиксировались все основные действия». Новые типы: USER_LOGIN («Вход в
платформу», имя и роль вошедшего — политика разрешает имена),
TASK_CREATED («Новая задача», имя клиента/номер сделки, БЕЗ заголовка).
«Новое письмо» уже покрыто (Клиент написал / Сообщение не разобрано).
Каждый тип — свой тумблер (появляются автоматически из каталога).
DoD: publisher'ы в login-экшене и createCrmTask; dedupe-ключи; роутинг
(shared + fallbackPermission); формат Telegram по политике; тесты RED→GREEN;
тумблеры видны; полный гейт.

### Story 5: Ревизия аудита

Objective: все основные действия платформы пишутся в AuditLog.
Инвентаризация текущих auditLog.create → добить недостающее: вход в
платформу, задачи (создание/выполнение/отмена/взятие/переназначение),
разбор писем (архив/спам/привязка), назначение менеджера клиента (из
Story 2), создание сделки/сметы, ручной пул почты. Единый паттерн записей
(actor, action, target, безопасные metadata).
DoD: таблица «действие → пишется» в PR-описании; тесты на новые точки;
полный гейт.

#### Действие → пишется

Инвентаризация выполнена по всем прямым `auditLog.create` и вызовам
`recordAudit`. В metadata не пишутся заголовки/тела задач и писем, пароли,
токены, Telegram `chat_id` или адреса почтовых ящиков.

| Действие | `AuditLog.action` | Точка записи | Безопасные metadata |
|---|---|---|---|
| Вход по паролю (основной и inline checkout) | `user.login` | `app/actions/login.ts` | метод входа |
| Создание задачи | `task.create` | `app/actions/crm/tasks.ts` | owner/customer/deal id, срок |
| Выполнение задачи | `task.complete` | `app/actions/crm/tasks.ts` | без содержимого задачи |
| Отмена задачи | `task.cancel` | `app/actions/crm/tasks.ts` | без содержимого задачи |
| Взятие задачи | `task.claim` | `app/actions/crm/tasks.ts` | прежний/новый owner id |
| Переназначение задачи | `task.reassign` | `app/actions/crm/tasks.ts` | прежний/новый owner id |
| Повторное открытие / перенос срока | `task.reopen`, `task.reschedule` | `app/actions/crm/tasks.ts` | новый срок только для переноса |
| Привязка письма к клиенту/сделке | `inbox.link` | `app/actions/crm/inbox.ts` | inbox/customer/deal/communication id, направление, alias-флаг |
| Спам / архив письма | `inbox.spam`, `inbox.archive` | `app/actions/crm/inbox.ts` | предыдущий статус |
| Назначение / снятие менеджера клиента | `customer.manager_assign`, `customer.manager_unassign` | `app/actions/crm/customers.ts` | прежний/новый manager id |
| Ручное создание сделки | `deal.create` | `app/actions/crm/deals.ts` | customer/vehicle id, channel, source |
| Создание пустой сметы / ревизии | `estimate.create` | `app/actions/crm/estimates.ts` | deal id, вид создания, parent id для ревизии |
| Ручная проверка почты | `mail.sync_manual` | `app/actions/mail-sync.ts` | processed/created/sourceCount |
| Создание пользователя, смена роли, сброс пароля, блокировка | `user.create`, `user.role_change`, `user.password_reset`, `user.block` | `app/actions/user-management.ts` | ids, роли и флаги без credentials |
| Архив / восстановление / стирание клиента | `customer.archive`, `customer.restore`, `customer.erase` | CRM customer actions | ids и агрегированные счётчики удаления |
| Изменение / сброс прав роли | `role.permissions_set`, `role.permissions_reset` | `app/actions/roles.ts` | роль и набор прав |
| Привязка / отвязка / режим Telegram | `telegram.destination_link`, `telegram.destination_unlink`, `telegram.destination_scope_change` | staff-notification actions/webhook | kind/scope/count, без `chat_id` |
| Сбой ответа / карантин update Telegram | `telegram.webhook_reply_failed`, `telegram.update_quarantined` | Telegram webhook/polling | безопасный error code/status или update id/attempts |
| Повтор dead-letter доставки | `staff_notification.delivery_retry` | `app/actions/staff-notifications.ts` | channel, attempts, error code |
| Удаление сделки / сметы / автомобиля | `deal.delete`, `estimate.delete`, `vehicle.delete` | соответствующие CRM actions | ids, стадия и агрегаты |
| Создание заказ-наряда | `repairOrder.create` | `app/actions/repair-orders.ts` | customer/deal id и наличие автомобиля |
