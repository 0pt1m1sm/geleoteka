import { db } from "@/lib/db";
import { extractModelCodes } from "@/lib/part-reference";

/**
 * Перелинковка между статьями и страницами кузовов.
 *
 * Зачем. Статьи Яндекс тоже пометил маловостребованными (6 из 17), но лечится
 * это не индексацией: тексты содержательные, им не хватает связей. Статья
 * «слабые места W463» и страница кузова W463 с тремя сотнями деталей — про одно
 * и то же, а ссылок друг на друга у них не было ни одной. Для читателя это
 * тупик, для поисковика — два одиноких документа вместо связанного раздела.
 *
 * Связь выводится из ТЕКСТА, а не из отдельного поля: коды кузовов и так
 * написаны в заголовках и тегах, и заставлять редактора дублировать их в
 * третьем месте значит гарантировать расхождение.
 */

export interface RelatedPost {
  slug: string;
  title: string;
  excerpt: string | null;
}

export interface RelatedGeneration {
  code: string;
  yearFrom: number;
  yearTo: number | null;
  model: { name: string; slug: string };
}

/** Статьи, где упомянут этот кузов — по тегам, заголовку или тексту. */
export async function postsForGeneration(code: string, limit = 6): Promise<RelatedPost[]> {
  return (await db.blogPost.findMany({
    where: {
      published: true,
      OR: [
        { tags: { has: code } },
        { tags: { has: code.toLowerCase() } },
        { title: { contains: code, mode: "insensitive" } },
        { content: { contains: code, mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true, excerpt: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  })) as RelatedPost[];
}

/**
 * Кузова, упомянутые в статье.
 *
 * Коды берутся тем же разбором, что и при импорте номенклатуры, и сверяются с
 * каталогом: в тексте может встретиться кузов, которого у нас нет, и вести на
 * несуществующую страницу нельзя.
 */
export async function generationsForPost(
  input: { title: string; content: string; tags: string[] },
  limit = 4,
): Promise<RelatedGeneration[]> {
  const codes = extractModelCodes(`${input.title} ${input.tags.join(" ")} ${input.content}`);
  if (codes.length === 0) return [];

  return (await db.vehicleGeneration.findMany({
    where: { code: { in: codes }, isActive: true, model: { isActive: true } },
    select: {
      code: true,
      yearFrom: true,
      yearTo: true,
      model: { select: { name: true, slug: true } },
    },
    orderBy: { sortOrder: "asc" },
    take: limit,
  })) as RelatedGeneration[];
}
