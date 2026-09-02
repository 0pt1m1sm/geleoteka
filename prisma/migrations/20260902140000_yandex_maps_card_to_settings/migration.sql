-- Карточка организации в Яндекс Картах переезжает из кода в настройки.
--
-- В `lib/yandex.ts` стоял идентификатор организации Гелеотеки числом. Второй
-- арендатор показал бы у себя на сайте чужие отзывы и вёл бы посетителей на
-- чужую карточку — это подмена данных, а не неудачное место для настройки.
--
-- Значения переносятся ТОЛЬКО в установку Гелеотеки. Условие по ключу
-- арендатора здесь обязательно: миграции накатываются на любую установку
-- платформы, и без него следующий клиент получил бы ровно ту самую чужую
-- карточку, ради избавления от которой всё и делается.

INSERT INTO "Setting" ("id", "key", "value", "updatedAt")
SELECT 'seed_yandex_maps_org_id', 'YANDEX_MAPS_ORG_ID', '211932722600', now()
WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE "key" = 'geleoteka')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Setting" ("id", "key", "value", "updatedAt")
SELECT 'seed_yandex_maps_profile', 'YANDEX_MAPS_PROFILE_URL', 'https://yandex.com/maps/-/CPWFAQ-m', now()
WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE "key" = 'geleoteka')
ON CONFLICT ("key") DO NOTHING;
