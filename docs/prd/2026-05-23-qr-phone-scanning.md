# PRD: QR-сканирование телефоном для склада БУ автозапчастей

Created: 2026-05-23
Status: PRD (folded into docs/prd/2026-05-22-warehouse-wms-roadmap.md)

> **Reconciliation decision (2026-05-23):** the platform stays on the **quantity-aggregate**
> WMS model (`StockItem.quantity` per `Part`/SKU + `StockBin` placement). The per-physical-unit
> serialized model described in §8.1/§26 below is **NOT adopted** — QR + scanning operate at
> Part (SKU) + order-line + bin level. See the roadmap's "Phone QR-Scanning workstream" section
> for how each PRD operation maps onto the aggregate model. The §8.1 per-unit fields
> (`warehouse_status`, `current_location_id` on a single item row) are superseded by the existing
> movement ledger + bin placement + order/order-line status.

## 1. Назначение

Добавить в существующую CRM/WMS возможность использовать телефон как QR-сканер для складских операций. Кладовщик сканирует QR деталей, ячеек, заказов и упаковок, чтобы фиксировать физические складские действия в WMS без ручного ввода идентификаторов. Платформа уже имеет адаптивный интерфейс; отдельное мобильное приложение и отдельный mobile frontend в MVP не требуются.

## 2. Контекст

Склад перепродаёт БУ автозапчасти. У большинства деталей нет заводского штрихкода — платформа генерирует внутренний QR при приёмке/регистрации. Телефон — только устройство сканирования; бизнес-логика на backend.

## 3. Проблема

Ручной ввод ячейки/статуса, путаница похожих деталей, расхождение факта и WMS, ошибки сборки, ручная инвентаризация. QR-сканирование связывает физическое действие с изменением данных в WMS.

## 4. Цели

**Бизнес:** −50% ошибок размещения (3 мес), −60% ошибок подбора, −30% времени инвентаризации, 100% движений с user_id+timestamp, 80% операций через QR.
**Продуктовые:** внутренний QR на деталь и ячейку; сканирование камерой; операции в адаптивном интерфейсе; история сканов и движений; блокировка ошибочных операций до записи в WMS.

## 5. Не цели MVP

RFID; native-приложение; отдельный mobile frontend; offline-first; Bluetooth-сканеры; CV-распознавание деталей; авто-оптимизация размещения; маршрутизация; интеграция с промышленными ТСД.

## 6. Роли

Существующие: `admin`, `manager`, `client`. Новая: `warehouse_worker`.

## 7. Права ролей (сводно)

- Просмотр деталей: admin/manager/warehouse_worker (client — ограниченно).
- Создание детали, печать QR детали: admin/manager/warehouse_worker.
- Печать QR ячейки, настройка ячеек, просмотр аудита: admin (аудит — и manager).
- Размещение/перемещение/подбор/упаковка/отгрузка: admin/warehouse_worker.
- Резервирование: admin/manager.
- client: складских операций нет.

## 8. Доработки модели данных

Названия логические — сопоставить с фактическими моделями платформы.

### 8.1 Деталь/товарная единица — *(per-unit вариант НЕ принят, см. reconciliation)*
Логические поля: `qr_code`, `public_code` (unique), `current_location_id`, `warehouse_status`, `last_scanned_at`, `last_scanned_by`. Рекомендуемые статусы: received/stored/reserved/picked/packed/shipped/returned/lost/scrapped.

### 8.2 Складская ячейка
`code` (unique), `qr_code` (unique), `is_active`, `is_blocked`. Пример кода `B-04-03-12`, QR `WMS:LOC:B-04-03-12`.

### 8.3 Заказ
`qr_code` (nullable), `warehouse_status`. Можно генерировать QR из order id/number без отдельного поля.

### 8.4 Задание на подбор (если нет — добавить)
`order_id`, `item_id`, `expected_location_id?`, `status` (pending/picked/cancelled), `assigned_to?`, `picked_at?`.

### 8.5 Упаковка (если нет — добавить)
`order_id`, `package_code` (unique), `qr_code` (unique), `status` (created/packing/packed/shipped).

### 8.6 Scan Event (новая)
`id`, `user_id`, `device_id?`, `session_id?`, `action`, `raw_code`, `parsed_object_type?`, `parsed_object_id?`, `result` (success/rejected/error), `error_code?`, `created_at`. Фиксирует ВСЕ сканы, включая неуспешные.

### 8.7 Stock Movement (использовать существующий журнал)
`id`, `item_id`, `from_location_id?`, `to_location_id?`, `from_status?`, `to_status?`, `action`, `order_id?`, `package_id?`, `scan_event_id?`, `user_id`, `idempotency_key` (unique), `created_at`. Создаётся только после успешной валидации.

## 9. Формат QR-кодов

QR содержит ТОЛЬКО идентификатор объекта (не цену/описание/состояние/адрес/данные клиента).
Формат: `WMS:PART:<id>`, `WMS:LOC:<code>`, `WMS:ORDER:<number>`, `WMS:BOX:<code>`.

## 10. Сценарии

- **10.1 Приёмка:** создать/открыть карточку детали → сгенерировать public_code+QR → печать → наклеить → скан → статус received.
- **10.2 Размещение:** скан детали → скан ячейки → проверки → обновить location → движение.
- **10.3 Перемещение:** скан детали → скан новой ячейки → обновить location → движение.
- **10.4 Подбор:** открыть заказ/задание → скан ячейки → скан детали → сверка с заданием; неверная деталь → блок + scan event rejected.
- **10.5 Упаковка:** скан заказа → скан упаковки → скан детали → проверка принадлежности → связать → статус packed.
- **10.6 Отгрузка:** скан заказа/упаковки → проверка что всё упаковано → подтвердить → статус shipped + статус заказа.
- **10.7 Инвентаризация:** скан ячейки → скан всех деталей → завершить → расхождения found/missing/unexpected/unknown (без авто-списания).

## 11–12. Интерфейс и компонент сканирования

Отдельный mobile frontend не нужен — адаптировать существующие экраны. Разделы warehouse_worker: приёмка/размещение/перемещение/сборка/упаковка/отгрузка/инвентаризация/поиск.
Компонент QR-сканера: камера телефона, распознавание QR, отправка raw code на backend, ручной ввод как fallback, показ результата, блок повторного скана 1 с, работа в адаптивном интерфейсе. Показ карточек детали/ячейки/заказа после скана.

## 13. API (рекомендуемые)

`POST /api/warehouse/scan` (универсальный), `.../items/{id}/qr`, `.../putaway`, `.../move`, `.../pick`, `.../pack`, `.../cycle-count`. Все write — с `idempotency_key`. Ответы содержат `ok`, типизированные ошибки (см. §18).

## 14. Валидация

Авторизация обязательна; нераспознанный QR запрещён; роль проверяется; движение только после валидации; защита от дублей по idempotency_key; нельзя отгрузить не-packed; нельзя подобрать чужую деталь; нельзя разместить в заблокированную ячейку; нельзя двигать shipped/scrapped/lost без admin.

## 15. Печать этикеток

Этикетка детали: QR + public_code + тип/марка/модель/год/сторона + краткое состояние. Этикетка ячейки: код + зона/стеллаж/полка + QR. Формат MVP: PDF. Позже: ZPL/EPL/термопринтер.

## 16. Аудит

Каждая операция: user_id, device_id?, timestamp, action, raw_code, object_type, object_id, previous_state, new_state, result, error_code?, ip_address, user_agent. Append-only.

## 17. Безопасность

HTTPS-only; авторизация; QR не даёт прав (backend проверяет роль+статус+допустимость); все write требуют idempotency_key; все сканы логируются; QR без цены/PII; потерянный телефон — сброс сессий. Защита от подделки: MVP — только внутренний id + backend-проверки; позже — HMAC, device binding.

## 18. Коды ошибок

`UNKNOWN_CODE`, `WRONG_OBJECT_TYPE`, `WRONG_ITEM`, `INVALID_STATUS`, `LOCATION_BLOCKED`, `PERMISSION_DENIED`, `DUPLICATE_OPERATION`, `NETWORK_ERROR`.

## 19. НФТ

Распознавание QR ≤2 с; scan API ≤500 мс p95; putaway/move/pick ≤800 мс p95; инвентаризация ≤100 деталей ≤2 с. Совместимость: iOS Safari, Android Chrome, desktop Chrome (тест). Плохая связь: явная ошибка, без silent retry для изменений состояния, повтор по тому же idempotency_key.

## 20. Аналитика

События: qr_scan_started/success/failed, putaway/move/pick_completed, pick_rejected, pack/shipment_completed, cycle_count_started/completed, label_printed. Метрики: scan success rate, pick error rate, avg putaway time, inventory discrepancy rate, manual fallback rate, duplicate scan rate.

## 21. Acceptance criteria

См. оригинал — по каждому сценарию (приёмка/размещение/перемещение/подбор/упаковка/инвентаризация) проверяемые критерии: генерация уникального QR, печать, корректные статусы/локации, scan event с user/time/result, блокировка неверной детали, защита от дублей, расхождения без авто-списания.

## 22. MVP scope

Адаптивный интерфейс; QR-сканер камерой; карточка детали; генерация QR; PDF-этикетка; QR ячеек; размещение/перемещение/подбор/упаковка/отгрузка/инвентаризация; роль warehouse_worker; проверка прав; scan event; stock movement; audit log; idempotency_key. Не входит: RFID/native/mobile-frontend/offline-first/Bluetooth/CV/маршруты.

## 23. Фазы (оригинальные)

1. Данные и QR; 2. Складские операции (сканер, приёмка, размещение, перемещение); 3. Заказы (подбор, упаковка, отгрузка, проверка неверной детали); 4. Инвентаризация; 5. Hardening (скорость, HMAC, доверенные устройства, Bluetooth, offline queue).

## 24. Технические риски

Плохое чтение QR → крупные QR + контраст + ручной fallback; печать → тест этикеток, QR ≥20×20 мм; связь → Wi-Fi survey + idempotency retry; обход процесса → ограничить ручные изменения статуса/location; похожие детали → фото + exact item id; копирование QR → backend validation + HMAC позже; много обязательных полей → минимум полей в MVP.

## 25. Открытые вопросы

1. Имя модели физической детали? 2. SKU vs физическая единица? 3. Адресное хранение есть? 4. Журнал движений есть? 5. Сущность подбора есть? 6. Как печатаются этикетки? 7. Личные/корпоративные телефоны? 8. Wi-Fi во всех зонах? 9. Несколько складов? 10. Связь детали с машиной-донором? 11. Блокировать продажу после резерва? 12. Показывать клиенту статус детали или только заказа?

## 26. Ключевой принцип

QR-сканирование выполняет **контекстную операцию**, определяемую режимом интерфейса: размещение (деталь+ячейка→location), перемещение (деталь+новая ячейка→движение), подбор (заказ+деталь→сверка), упаковка (заказ+коробка+деталь→связь), инвентаризация (ячейка+детали→сверка). Один QR детали используется в разных режимах.
