import { Star as LucideStar } from "lucide-react";
import { YANDEX_PROFILE_URL } from "@/lib/yandex";
import { fetchYandexReviews, type YandexReview } from "@/lib/yandex-reviews";

function Star({ filled }: { filled: boolean }): React.ReactElement {
  return (
    <LucideStar
      size={14}
      strokeWidth={1.25}
      fill={filled ? "var(--color-accent)" : "transparent"}
      stroke="var(--color-accent)"
      aria-hidden
      className="shrink-0"
    />
  );
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

function ReviewCard({ review }: { review: YandexReview }): React.ReactElement {
  return (
    <article className="card flex flex-col text-left">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center border border-accent/40 bg-accent/10 text-base font-bold text-accent">
          {getInitial(review.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-foreground">
            {review.name}
          </div>
          <div className="mt-0.5 text-xs text-foreground-muted">
            {review.date}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 pt-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} filled={i <= review.rating} />
          ))}
        </div>
      </header>
      <p className="text-sm leading-relaxed text-foreground-muted">
        {review.text}
      </p>
    </article>
  );
}

export async function Reviews(): Promise<React.ReactElement> {
  const data = await fetchYandexReviews();
  const reviews = data.reviews.slice(0, 6);

  return (
    <>
      {/* Aggregate rating header — sharp, monumental, on-brand */}
      <div className="mb-12 flex flex-col items-center">
        <div className="flex items-center gap-5">
          <div className="text-display text-6xl font-bold leading-none text-accent sm:text-7xl">
            {data.overallRating}
          </div>
          <div className="flex flex-col gap-1.5 text-left">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} filled />
              ))}
            </div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-foreground-muted">
              {data.statsLine}
            </p>
          </div>
        </div>
        <div className="mt-6 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-foreground-muted">
          <span className="h-px w-8 bg-accent/40" />
          источник — Яндекс Карты
          <span className="h-px w-8 bg-accent/40" />
        </div>
      </div>

      {/* Cards grid. Empty state: silently skip the grid and let the CTA carry the section.
          Index suffixes the key to defend against same-name + same-date collisions. */}
      {reviews.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {reviews.map((r, i) => (
            <ReviewCard key={`${r.name}-${r.date}-${i}`} review={r} />
          ))}
        </div>
      )}

      <div className="mt-10 text-center">
        <a
          href={YANDEX_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
        >
          Все отзывы на Яндекс Картах →
        </a>
      </div>
    </>
  );
}
