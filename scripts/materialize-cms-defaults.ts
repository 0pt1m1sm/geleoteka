/**
 * Перенести содержимое сайта из умолчаний в коде в редактируемые блоки.
 *
 * Зачем. Таблица `CMSBlock` пуста, а публичный сайт целиком рендерится из
 * `defaultValue` в `lib/cms-schema.ts`: 96 ключей, одиннадцать разделов. То
 * есть содержимое первого клиента — тексты, залог, юрлицо, адрес почты — живёт
 * в коде платформы. Второй арендатор получил бы чужой сайт, а привести
 * умолчания к нейтральному виду нельзя, пока от них зависит боевой сайт.
 *
 * Этот скрипт разрывает зависимость: каждое умолчание записывается строкой в
 * `CMSBlock`. После него сайт рендерится из базы, содержимое становится
 * редактируемым из админки, а умолчания в коде можно приводить к
 * платформенному виду, ничего не ломая.
 *
 * Идемпотентен: существующие блоки не трогает — правка менеджера всегда важнее
 * умолчания. Обратим: удалить созданные строки — вернуться к прежнему
 * поведению.
 *
 * Запуск: DATABASE_URL=... npx tsx scripts/materialize-cms-defaults.ts [--apply]
 * Без --apply только показывает, что будет сделано.
 */
import { PrismaClient } from "@/app/generated/prisma/client";

import { CMS_SCHEMA } from "@/lib/cms-schema";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();

async function main(): Promise<void> {
  const entries = Object.entries(CMS_SCHEMA as Record<string, { type?: string; defaultValue?: unknown }>);
  const withDefault = entries.filter(([, d]) => d.defaultValue !== undefined);

  const existing = new Set(
    ((await db.cMSBlock.findMany({ select: { key: true } })) as Array<{ key: string }>).map((r) => r.key),
  );

  const toCreate = withDefault.filter(([key]) => !existing.has(key));

  console.log(`ключей в схеме: ${entries.length}`);
  console.log(`из них с умолчанием: ${withDefault.length}`);
  console.log(`уже есть блоком: ${existing.size}`);
  console.log(`будет создано: ${toCreate.length}`);

  if (!apply) {
    console.log("\nпробный прогон. Для записи добавьте --apply");
    return;
  }

  let created = 0;
  for (const [key, descriptor] of toCreate) {
    await db.cMSBlock.create({
      data: {
        key,
        // Тип блока хранится рядом с содержимым: рендер по нему решает, как
        // показывать. У схемы он есть у каждого ключа, умолчание — text.
        type: descriptor.type ?? "text",
        content: descriptor.defaultValue as never,
      },
    });
    created++;
  }
  console.log(`создано блоков: ${created}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
