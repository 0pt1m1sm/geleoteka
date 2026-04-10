import Link from "next/link";
import { MODELS } from "@/lib/models-data";

export default function ModelsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-display text-4xl sm:text-5xl font-bold mb-4">
          Модели
        </h1>
        <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto text-lg">
          Обслуживаем весь модельный ряд Mercedes-Benz — от C-Class до AMG и
          электрических EQ
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {MODELS.map((model) => (
          <Link
            key={model.slug}
            href={`/models/${model.slug}`}
            className="card card-hover group flex flex-col"
          >
            <h2 className="text-xl font-bold mb-1 group-hover:text-[var(--color-accent)] transition-colors">
              {model.name}
            </h2>
            <p className="text-xs text-[var(--foreground-muted)] mb-3">
              {model.generations}
            </p>
            <p className="text-sm text-[var(--foreground-muted)] mb-4 flex-1 line-clamp-3">
              {model.description}
            </p>
            <p className="text-sm text-[var(--color-accent)] font-medium">
              {model.priceNote}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
