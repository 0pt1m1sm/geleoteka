import { YANDEX_REVIEWS_IFRAME_URL } from "./yandex";

export interface YandexReview {
  name: string;
  date: string;
  rating: number;
  text: string;
}

export interface YandexReviewsData {
  overallRating: string;
  statsLine: string;
  reviews: YandexReview[];
}

const FALLBACK: YandexReviewsData = {
  overallRating: "5,0",
  statsLine: "Отзывы на Яндекс Картах",
  reviews: [],
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Fetches the public Yandex Maps reviews widget HTML and parses it into structured data.
 * Cached via Next.js fetch revalidation (1 hour) — page is regenerated at most hourly.
 * Falls back to an empty review list on any error so the page never breaks.
 */
export async function fetchYandexReviews(): Promise<YandexReviewsData> {
  try {
    const res = await fetch(YANDEX_REVIEWS_IFRAME_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FALLBACK;
    const html = await res.text();

    const overallRating =
      html.match(/mini-badge__stars-count">([^<]+)/)?.[1].trim() ?? "5,0";

    const statsLine =
      [...html.matchAll(/>([^<]*отзыв[^<]*оцен[^<]*)</g)][0]?.[1].trim() ??
      "Отзывы на Яндекс Картах";

    const reviews: YandexReview[] = [];
    const commentRegex =
      /<div class="comment">[\s\S]*?<p class="comment__name">([^<]+)<\/p>[\s\S]*?<p class="comment__date">([^<]+)<\/p>[\s\S]*?<ul class="stars-list">([\s\S]*?)<\/ul>[\s\S]*?<p class="comment__text">([^<]*)<\/p>/g;

    let m: RegExpExecArray | null;
    while ((m = commentRegex.exec(html)) !== null) {
      const [, name, date, starsBlock, text] = m;
      const total = (starsBlock.match(/<li/g) ?? []).length;
      const empty = (starsBlock.match(/_empty/g) ?? []).length;
      const rating = Math.max(0, Math.min(5, total - empty));
      reviews.push({
        name: decodeEntities(name).trim(),
        date: decodeEntities(date).trim(),
        rating,
        text: decodeEntities(text).trim(),
      });
    }

    if (reviews.length === 0) return FALLBACK;

    return { overallRating, statsLine, reviews };
  } catch {
    return FALLBACK;
  }
}
