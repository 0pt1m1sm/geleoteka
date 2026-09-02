/**
 * Заливка текста статьи из репозитория в базу.
 *
 * Статьи живут в базе, а редактируются здесь — чтобы правку можно было
 * прочитать в PR до того, как её увидит читатель. Скрипт ничего не публикует
 * сам: он обновляет текст уже существующей статьи и не трогает ни заголовок,
 * ни признак публикации.
 *
 *   npx tsx scripts/apply-blog-content.ts content/blog/<slug>.md
 *   npx tsx scripts/apply-blog-content.ts content/blog/<slug>.md --dry
 *
 * Имя файла — это slug статьи. Несуществующий slug — ошибка, а не создание
 * новой: молча завести статью мимо редактора значит опубликовать текст,
 * которого никто не ждал.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { PrismaClient } from "../app/generated/prisma/client";

const db = new PrismaClient();

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error("Укажите файл: npx tsx scripts/apply-blog-content.ts content/blog/<slug>.md");
  const dry = process.argv.includes("--dry");

  const slug = basename(file).replace(/\.md$/, "");
  const content = readFileSync(file, "utf8").trim();

  const existing = (await db.blogPost.findUnique({
    where: { slug },
    select: { id: true, title: true, content: true, published: true },
  })) as { id: string; title: string; content: string; published: boolean } | null;

  if (!existing) throw new Error(`Статьи со slug «${slug}» нет. Создание новых — через админку.`);

  console.log(`статья:      ${existing.title}`);
  console.log(`опубликована: ${existing.published ? "да" : "нет"}`);
  console.log(`было:        ${existing.content.length} знаков`);
  console.log(`станет:      ${content.length} знаков`);

  if (dry) {
    console.log("\n--dry: ничего не записано");
    return;
  }
  await db.blogPost.update({ where: { slug }, data: { content } });
  console.log("\nтекст обновлён");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
