-- Длинный текст и FAQ страницы услуги (SEO-контент, правится в админке)
ALTER TABLE "Service" ADD COLUMN "body" TEXT;
ALTER TABLE "Service" ADD COLUMN "faq" JSONB;
