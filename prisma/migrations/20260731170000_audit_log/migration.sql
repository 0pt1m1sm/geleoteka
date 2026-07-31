-- Журнал действий: кто, что и над кем.
--
-- Его не было вообще. Кто стёр клиента, кто сменил роль, кто выдал себе права —
-- нигде не фиксировалось, при том что удаление персональных данных и раздача
-- доступов появились в системе на этой же неделе.
--
-- БЕЗ внешних ключей — сознательно. Журнал, строки которого исчезают вместе с
-- субъектом, бесполезен ровно тогда, когда нужен: весь смысл в том, чтобы
-- ответить «кто удалил этого клиента» ПОСЛЕ того, как клиента не стало.
-- Поэтому actorUserId и targetId — обычные строки, а читаемые имена
-- денормализованы на момент записи: журнал хранит то, что было правдой тогда,
-- а не то, что показал бы join сегодня.
--
-- Append-only по соглашению: приложение не обновляет и не удаляет эти строки.
--
-- tenantKey по правилу для новых таблиц; индексы под четыре запроса, которые
-- реально будут: лента по времени, действия одного человека, история одного
-- объекта и выборка по типу действия.
--
-- Только создание таблицы — существующие данные не читаются и не меняются,
-- деплой на живом сервисе безопасен.
--
-- NOTE: Prisma diff здесь также хочет снести GIN-индексы Part_photos_gin_idx /
-- Vehicle_photos_gin_idx и переименовать индекс StockMovement. Опущено по
-- стоящей конвенции — см. 20260720083911, 20260730172500, 20260730180000,
-- 20260731120000, 20260731140000, 20260731160000.

CREATE TABLE "AuditLog" (
  "id"          TEXT NOT NULL,
  "tenantKey"   TEXT NOT NULL DEFAULT 'geleoteka',
  "actorUserId" TEXT,
  "actorName"   TEXT NOT NULL,
  "actorRole"   TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT,
  "targetLabel" TEXT,
  "metadata"    JSONB NOT NULL DEFAULT '{}',
  "ip"          TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_tenantKey_createdAt_idx"
  ON "AuditLog"("tenantKey", "createdAt");

CREATE INDEX "AuditLog_tenantKey_actorUserId_createdAt_idx"
  ON "AuditLog"("tenantKey", "actorUserId", "createdAt");

CREATE INDEX "AuditLog_tenantKey_targetType_targetId_idx"
  ON "AuditLog"("tenantKey", "targetType", "targetId");

CREATE INDEX "AuditLog_tenantKey_action_createdAt_idx"
  ON "AuditLog"("tenantKey", "action", "createdAt");
