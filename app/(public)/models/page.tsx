import Link from "next/link";
import { MODELS, generationLabel } from "@/lib/models-data";

export default function ModelsPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-display text-4xl sm:text-5xl font-bold mb-4">
          Модели Mercedes-Benz
        </h1>
        <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto text-lg">
          Обслуживаем весь модельный ряд — от A-Class до AMG и электрических EQ.
          Выберите свою модель, чтобы посмотреть доступные услуги.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {MODELS.map((model) => (
          <Link
            key={model.slug}
            href={`/models/${model.slug}`}
            className="card card-hover group flex flex-col"
          >
            <h2 className="text-xl font-bold mb-2 group-hover:text-[var(--color-accent)] transition-colors">
              Mercedes-Benz {model.name}
            </h2>
            <ul className="flex flex-wrap gap-1.5 mb-3">
              {model.generations.map((g) => (
                <li
                  key={g.code}
                  className="badge badge-silver text-[10px] font-mono"
                  title={generationLabel(g)}
                >
                  {generationLabel(g)}
                </li>
              ))}
            </ul>
            <p className="text-sm text-[var(--foreground-muted)] flex-1 line-clamp-3">
              {model.description}
            </p>
            <span className="text-sm text-[var(--color-accent)] font-medium mt-4 group-hover:translate-x-0.5 transition-transform inline-block">
              Услуги для {model.name} →
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-16 text-center">
        <p className="text-[var(--foreground-muted)] mb-4 text-sm">
          Не нашли свою модель?
        </p>
        <Link href="/booking" className="btn btn-primary">
          Записаться — мастер уточнит совместимость
        </Link>
      </div>
    </div>
  );
}
