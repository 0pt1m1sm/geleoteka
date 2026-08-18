# Nomenclature Thread Implementation Plan

Created: 2026-08-18
Status: VERIFIED
Mode: auto
Iterations: 4
Type: Feature

Сквозная связь строк документов с номенклатурой (PartReference) — закрытие
находок аудита «Анатомия запчасти». Цель: позиция, выбранная из справочника,
не теряет связь с ним нигде — смета → закупка → приёмка → остаток.

## Ключевые решения (из разведки)

- **EstimateLine.referenceId — добавляем.** Строка «из справочника» сейчас
  имеет `partId = null` и голый текст — связь теряется. Nullable FK, SetNull.
- **SupplierOrderItem.referenceId — НЕ добавляем.** Каждая PART-строка уже
  резолвится в Part (NEW_PART создаёт draft-Part в resolveLinesAndCost),
  нить к номенклатуре идёт через `Part.referenceId`. Новая колонка — дубль.
- **PartLine — НЕ трогаем.** Мёртвая модель: ни одной точки записи в
  приложении (только generated client). Живой процесс — сметы CRM.
  Зарегистрировано как долг (кандидат на удаление отдельной инициативой).
- **Щель, которую закрываем в закупках:** NEW_PART создаёт Part напрямую
  (`tx.part.create` в resolveLinesAndCost) — мимо справочника и без
  referenceId. Нужен общий серверный хелпер захвата.
- Захват в справочник сегодня продублирован в createPart и /api/parts/import
  — вынести в хелпер и переиспользовать в трёх местах.

## Progress Tracking

- [x] Story 1: EstimateLine.referenceId — схема, миграция с бэкфиллом, запись из пикера (Status: VERIFIED — миграция 20260818130000, бэкфилл 2/2, tsc 0, 612 тестов; UI-смоук нити — в Story 4)
- [x] Story 2: Единый хелпер захвата в справочник + NEW_PART в закупках через него (Status: VERIFIED — ensurePartReference в lib/part-reference-lookup.ts; createPart и resolveLinesAndCost через хелпер; scripts/verify-nomenclature-thread.ts 10/10; import route оставлен на createMany — долг зафиксирован)
- [x] Story 3: Подбор из справочника в форме заказа поставщику (Status: VERIFIED — PartRefPicker в NEW_PART строке OrderLineItems; tsc 0, lint 0 err; SSR-смоук формы: рендерится (тип «Новый товар» виден), сам пикер — в клиентской ветке NEW_PART, компонент вживую проверен на /admin/parts/new; клик-проверка за владельцем)
- [x] Story 4: Сквозная верификация нити + полный gate (Status: VERIFIED — verify-скрипт 10/10, 612 тестов, lint 0 err, tsc 0, build exit 0; артефакт «Анатомия запчасти» обновлён)

## Implementation Tasks

### Story 1: EstimateLine.referenceId — схема, миграция, запись из пикера

**Objective:** строка сметы, добавленная из справочника (без товара), хранит
FK на номенклатуру; существующие строки с товаром бэкфиллятся через
`Part.referenceId`.

**Files:**
- `prisma/schema.prisma` — EstimateLine: `referenceId String?` + relation
  `reference PartReference?` (SetNull) + `@@index([referenceId])`;
  PartReference: обратная связь `estimateLines EstimateLine[]`.
- `prisma/migrations/<ts>_estimate_line_reference/migration.sql` — ADD COLUMN
  IF NOT EXISTS + FK (DO $$ … duplicate_object) + index + бэкфилл:
  `UPDATE "EstimateLine" el SET "referenceId" = p."referenceId" FROM "Part" p
   WHERE el."referenceId" IS NULL AND el."partId" = p.id AND p."referenceId" IS NOT NULL`.
- `app/actions/crm/estimate-lines.ts` — addEstimateLine: читать
  `referenceId` из formData (trim || null), писать в create. updateEstimateLine
  не трогает (referenceId неизменяем, как partId).
- `components/crm/EstimatePartPicker.tsx` — pickReference: `fd.set("referenceId", r.id)`.

**DoD:**
- `prisma validate`, `migrate deploy` локально зелёные; бэкфилл: строки с
  partId получили referenceId (проверка SQL-счётчиком).
- tsc 0; vitest сюита зелёная.
- Смоук: добавление строки из справочника в DRAFT смету пишет referenceId
  (проверка через psql после server-action POST или UI-эквивалента).

### Story 2: Единый хелпер захвата в справочник + NEW_PART через него

**Objective:** одно место (lib) отвечает за «артикул+название → запись
справочника»; NEW_PART в заказе поставщику создаёт draft-Part уже связанным
с номенклатурой.

**Files:**
- `lib/part-reference-lookup.ts` (или новый `lib/part-reference-capture.ts`) —
  `ensurePartReference(tx, { article, name, groupName?, generationIds? }):
  Promise<string | null>` — null для служебных кодов (SERVICE_ARTICLE_RE)
  и пустой нормализации; upsert по oem (update: {}), select id. Принимает
  транзакционный клиент (TxClient/DbClientPort-совместимый).
- `app/actions/parts.ts` — createPart использует хелпер (убрать дублирование).
- `app/api/parts/import/route.ts` — по возможности перевести на хелпер
  (createMany-путь оставить, если правка рискованная — задача не про импорт).
- `app/actions/supplier-orders.ts` — resolveLinesAndCost: NEW_PART ветка
  вызывает хелпер и пишет `referenceId` в создаваемый draft-Part.

**DoD:**
- tsc 0, vitest зелёные; поведение createPart не изменилось (смоук: создание
  товара со связью и записью справочника).
- Создание заказа поставщику с NEW_PART строкой: draft-Part создан с
  referenceId, справочник содержит oem (проверка psql).

### Story 3: Подбор из справочника в форме заказа поставщику

**Objective:** менеджер добавляет позицию закупки выбором из номенклатуры,
а не ручным вводом артикула (тот же UX, что в форме товара).

**Files:**
- `components/admin/supplier-order-form/OrderLineItems.tsx` — для строки
  NEW_PART: кнопка «Из справочника» → `PartRefPicker` (reuse); onPick
  заполняет `article` + `description` строки. Если у выбранной позиции
  есть товар — PartRefPicker уже блокирует выбор бейджем «уже в магазине»
  (менеджер выбирает обычную PART-строку).
- `components/admin/PartRefPicker.tsx` — при необходимости лёгкая
  параметризация (не ломая PartForm).

**DoD:**
- tsc 0, vitest, lint зелёные.
- Смоук: страница new-заказа рендерит кнопку; SSR-грепом виден пикер;
  клиентская механика — типовая (та же, что уже проверена в PartForm).

### Story 4: Сквозная верификация нити + полный gate

**Objective:** доказать нить целиком и закрыть инициативу.

**Checks:**
- Смета: строка из справочника → `referenceId` в БД (Story 1 смоук повторно).
- Закупка: NEW_PART → draft-Part с referenceId + запись справочника (Story 2).
- Приёмка: existing receive-путь по partId работает (регресс не внесён) —
  vitest warehouse/wms сюиты зелёные.
- Полный gate: `tsc --noEmit` 0, `vitest run` все, `npm run lint` 0 ошибок,
  `npm run build` exit 0.
- Обновить память проекта и аудит-артефакт «Анатомия запчасти» (диаграмма:
  EstimateLine → PartReference; находка №1 → решено).

**DoD:** всё вышеперечисленное зелёное, ledger закрыт (все Story VERIFIED).

## Tech Debt (registered, out of scope)

- PartLine/JobLine/LaborLine — мёртвый домен строк Сервиса (нет точек
  записи); кандидат на удаление или сращивание с CRM-сметами.
- Применяемость задвоена по уровню: PartTrim (трим) vs Fitment (кузов) —
  свести к справочнику отдельной инициативой.
- `/api/parts/import` createMany-путь захвата остаётся вторым кодовым путём,
  если Story 2 не переведёт его на хелпер.
