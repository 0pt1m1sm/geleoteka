-- Фотоотчёты по заказ-нарядам отдавались кому угодно.
--
-- /api/images/<id> не проверял ничего и ставил `public, max-age=31536000,
-- immutable`: фотография чужой машины была доступна по прямой ссылке и на год
-- оседала в кэшах. По тому же маршруту идут витринные картинки — каталог
-- запчастей, аренда, контент сайта, — поэтому просто закрыть маршрут нельзя,
-- нужно различать сами изображения.
--
-- PUBLIC по умолчанию: витрина не должна измениться ни на байт, а закрытым
-- становится только то, что помечено осознанно.
--
-- Обратная засыпка идёт по RepairOrderPhoto.url — внешнего ключа на
-- UploadedImage там нет, ссылка хранится строкой вида `/api/images/<id>`,
-- поэтому id вынимается из хвоста строки. Условие на префикс отсекает случайные
-- внешние URL, если такие когда-то попадали в это поле.
--
-- Только добавление колонки со значением по умолчанию и UPDATE по узкому
-- множеству строк — деплой на живом сервисе безопасен.
--
-- NOTE: Prisma diff здесь также хочет снести GIN-индексы Part_photos_gin_idx /
-- Vehicle_photos_gin_idx и переименовать индекс StockMovement. Опущено по
-- стоящей конвенции — см. 20260720083911, 20260730172500, 20260730180000,
-- 20260731120000, 20260731140000, 20260731160000, 20260731170000.

CREATE TYPE "ImageVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "UploadedImage"
  ADD COLUMN "visibility" "ImageVisibility" NOT NULL DEFAULT 'PUBLIC';

UPDATE "UploadedImage" SET "visibility" = 'PRIVATE'
WHERE "id" IN (
  SELECT split_part("url", '/api/images/', 2)
  FROM "RepairOrderPhoto"
  WHERE "url" LIKE '/api/images/%'
);

CREATE INDEX "UploadedImage_visibility_idx" ON "UploadedImage"("visibility");
