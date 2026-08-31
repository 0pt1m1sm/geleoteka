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

/**
 * Ключевые слова услуг для связи со статьями.
 *
 * Отдельного поля у услуги нет, и заводить его ради этого не стоит: у статей
 * уже есть теги, и редактор их ставит. Список ниже — мост между слагом услуги и
 * тем, как про неё пишут в текстах. Он ЯВНЫЙ, а не выведенный из названия:
 * «Двигатель» по названию не совпадёт со статьёй про АКПП, а по смыслу статья
 * «пинки и толчки» относится к трансмиссии, и это должен решать человек.
 *
 * Услуга «Другое» намеренно пустая: под неё подошло бы всё, и подборка
 * перестала бы что-либо значить.
 */
const SERVICE_KEYWORDS: Record<string, readonly string[]> = {
  to: ["ТО", "техобслуживание", "обслуживание", "регламент", "интервал"],
  transmission: ["АКПП", "трансмиссия", "коробка", "раздатка", "722.6", "722.9", "9G-Tronic"],
  repair: ["двигатель", "мотор", "ГРМ", "турбина"],
  suspension: ["подвеска", "амортизатор", "пневмо", "рычаг"],
  brakes: ["тормоз", "колодки", "диски"],
  body: ["кузов", "коррозия", "антикор", "рама", "покраска"],
  electric: ["электрика", "проводка", "аккумулятор", "блок управления"],
  conditioner: ["кондиционер", "климат", "заправка"],
  diagnostic: ["диагностика", "ошибки", "проверка", "перед покупкой"],
  other: [],
};

/** Статьи по теме услуги — по тегам и заголовку. */
export async function postsForService(slug: string, limit = 4): Promise<RelatedPost[]> {
  const words = SERVICE_KEYWORDS[slug] ?? [];
  if (words.length === 0) return [];

  return (await db.blogPost.findMany({
    where: {
      published: true,
      OR: words.flatMap((w) => [
        { tags: { has: w } },
        { title: { contains: w, mode: "insensitive" as const } },
      ]),
    },
    select: { slug: true, title: true, excerpt: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  })) as RelatedPost[];
}

/** Услуги, к которым относится статья: обратная сторона той же связи. */
export async function servicesForPost(
  input: { title: string; tags: string[] },
  limit = 3,
): Promise<Array<{ slug: string; name: string }>> {
  const haystack = `${input.title} ${input.tags.join(" ")}`.toLowerCase();
  const slugs = Object.entries(SERVICE_KEYWORDS)
    .filter(([, words]) => words.some((w) => haystack.includes(w.toLowerCase())))
    .map(([slug]) => slug);
  if (slugs.length === 0) return [];

  return (await db.service.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true },
    take: limit,
  })) as Array<{ slug: string; name: string }>;
}
