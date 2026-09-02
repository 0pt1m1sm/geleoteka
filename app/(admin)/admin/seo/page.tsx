export const dynamic = "force-dynamic";

import Link from "next/link";

import { SeoSnapshotForm } from "@/components/admin/SeoSnapshotForm";
import { IndexNowSubmitButton } from "@/components/admin/IndexNowSubmitButton";
import { Sparkline } from "@/components/admin/Sparkline";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { collectSeoHealth, withDelta } from "@/lib/seo-health";
import { fetchSearchTraffic } from "@/lib/yandex-metrika-api";
import { fetchWebmasterSummary } from "@/lib/yandex-webmaster";

interface SnapshotRow {
  id: string;
  createdAt: Date;
  source: string;
  sitemapUrls: number | null;
  indexedPagesApi: number | null;
  searchVisits7d: number | null;
  sqi: number | null;
  postsPublished: number;
  postsDraft: number;
  indexedPages: number | null;
  note: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function MetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="card">
      <p className="text-xs text-[var(--foreground-muted)] mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-[var(--foreground-muted)] mt-1">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-[var(--color-success,#4ade80)]" : "text-[var(--color-error)]"}>
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "" : "text-[var(--foreground-muted)]"}>{label}</span>
    </div>
  );
}

export default async function AdminSeoPage() {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);

  const [health, webmaster, traffic, snapshots] = await Promise.all([
    collectSeoHealth(),
    fetchWebmasterSummary(),
    fetchSearchTraffic(),
    db.seoSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        source: true,
        sitemapUrls: true,
        indexedPagesApi: true,
        searchVisits7d: true,
        sqi: true,
        postsPublished: true,
        postsDraft: true,
        indexedPages: true,
        note: true,
      },
    }) as Promise<SnapshotRow[]>,
  ]);

  // Динамика «страниц в поиске» — по авто-снапшотам (старые → новые).
  const indexedSeries = snapshots
    .filter((s) => s.source === "auto" && s.indexedPagesApi != null)
    .map((s) => s.indexedPagesApi as number)
    .reverse();
  const oldestIndexed = indexedSeries[0];
  const currentIndexed = webmaster?.searchablePages ?? indexedSeries[indexedSeries.length - 1];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Сайт"
        title="SEO"
        description="Данные Вебмастера и Метрики обновляются автоматически: живые блоки — при каждом открытии, слепок динамики — раз в сутки фоновым воркером."
      />

      {!health.oauthConfigured ? (
        <Card>
          <h2 className="text-lg font-semibold mb-2">Подключите данные Яндекса</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-3">
            Панель умеет сама тянуть «страницы в поиске», запросы с позициями и визиты из
            поиска. Для этого нужен OAuth-токен (один раз):
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-[var(--foreground-muted)]">
            <li>
              Откройте{" "}
              <a
                href="https://oauth.yandex.ru/client/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                oauth.yandex.ru
              </a>{" "}
              под аккаунтом, где подтверждён сайт в Вебмастере и создан счётчик Метрики.
            </li>
            <li>
              Создайте приложение, отметьте права: «Яндекс.Вебмастер» (чтение) и
              «Яндекс.Метрика — получение статистики».
            </li>
            <li>
              Получите токен по ссылке вида{" "}
              <code className="font-mono text-xs break-all">
                oauth.yandex.ru/authorize?response_type=token&client_id=&lt;ID приложения&gt;
              </code>
            </li>
            <li>
              Вставьте токен в{" "}
              <Link
                href="/admin/settings/integrations"
                className="text-[var(--color-accent)] hover:underline"
              >
                Настройки → Интеграции
              </Link>{" "}
              → «Яндекс OAuth-токен».
            </li>
          </ol>
        </Card>
      ) : null}

      {/* Ключевые метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Страниц в поиске"
          value={currentIndexed != null ? withDelta(currentIndexed, oldestIndexed) : "—"}
          hint={webmaster ? "Вебмастер API" : "нет данных API"}
        />
        <MetricCard
          title="Визиты из поиска, 7 дней"
          value={traffic ? String(traffic.visits7d) : "—"}
          hint={traffic ? `${traffic.visits30d} за 30 дней` : "нет данных API"}
        />
        <MetricCard
          title="Индекс качества (SQI)"
          value={webmaster?.sqi != null ? String(webmaster.sqi) : "—"}
        />
        <MetricCard
          title="Статьи"
          value={`${health.postsPublished}`}
          hint={`${health.postsDraft} черновиков ждут вычитки`}
        />
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold mb-2">Визиты из поиска — 30 дней</h2>
          {traffic && traffic.daily.length >= 2 ? (
            <Sparkline
              values={traffic.daily.map((p) => p.visits)}
              ariaLabel="Визиты из поиска по дням"
            />
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              Появится после подключения токена и первых визитов.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="text-sm font-semibold mb-2">Страниц в поиске — динамика</h2>
          {indexedSeries.length >= 2 ? (
            <Sparkline values={indexedSeries} ariaLabel="Страницы в поиске по дням" />
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              График строится по суточным слепкам — нужно минимум два дня данных.
            </p>
          )}
        </Card>
      </div>

      {/* Топ запросов */}
      {webmaster && webmaster.topQueries.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Запросы в Яндексе (неделя)</h2>
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-2 font-medium">Запрос</th>
                  <th className="px-4 py-2 font-medium text-right">Показы</th>
                  <th className="px-4 py-2 font-medium text-right">Клики</th>
                  <th className="px-4 py-2 font-medium text-right">Ср. позиция</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {webmaster.topQueries.map((q) => (
                  <tr key={q.query}>
                    <td className="px-4 py-2">{q.query}</td>
                    <td className="px-4 py-2 text-right">{q.shows}</td>
                    <td className="px-4 py-2 text-right">{q.clicks}</td>
                    <td className="px-4 py-2 text-right">{q.avgPosition ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {/* Техчек */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Техчек</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <StatusPill
            ok={(health.sitemapUrls ?? 0) > 9}
            label={
              health.sitemapUrls == null ? "Sitemap недоступен" : `Sitemap: ${health.sitemapUrls} URL`
            }
          />
          <StatusPill ok={health.metrikaConfigured} label="Метрика подключена" />
          <StatusPill ok={health.indexnowConfigured} label="IndexNow настроен" />
          <StatusPill ok={health.oauthConfigured} label="OAuth-токен Яндекса" />
          <StatusPill
            ok={health.servicesWithBody === health.servicesTotal}
            label={`Тексты услуг: ${health.servicesWithBody}/${health.servicesTotal}`}
          />
          <StatusPill
            ok={health.postsPublished > 0}
            label={`Статьи: ${health.postsPublished} опубл. / ${health.postsDraft} черн.`}
          />
        </div>
      </Card>

      {/* История слепков */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Суточные слепки</h2>
        {snapshots.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--foreground-muted)]">
              Первый авто-слепок появится в течение суток после деплоя.
            </p>
          </Card>
        ) : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium">В поиске (API)</th>
                  <th className="px-4 py-2 font-medium">Визиты 7д</th>
                  <th className="px-4 py-2 font-medium">SQI</th>
                  <th className="px-4 py-2 font-medium">Sitemap</th>
                  <th className="px-4 py-2 font-medium">Статьи</th>
                  <th className="px-4 py-2 font-medium">Заметка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {snapshots.map((s, i) => {
                  const prev = snapshots[i + 1];
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {DATE_FMT.format(s.createdAt)}
                        {s.source === "manual" ? (
                          <span className="text-xs text-[var(--foreground-muted)]"> · ручной</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        {withDelta(s.indexedPagesApi ?? s.indexedPages, prev?.indexedPagesApi ?? prev?.indexedPages)}
                      </td>
                      <td className="px-4 py-2">{withDelta(s.searchVisits7d, prev?.searchVisits7d)}</td>
                      <td className="px-4 py-2">{s.sqi ?? "—"}</td>
                      <td className="px-4 py-2">{withDelta(s.sitemapUrls, prev?.sitemapUrls)}</td>
                      <td className="px-4 py-2">
                        {withDelta(s.postsPublished, prev?.postsPublished)} / {s.postsDraft} черн.
                      </td>
                      <td className="px-4 py-2 max-w-[280px] truncate" title={s.note ?? ""}>
                        {s.note ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        <div className="mt-4 space-y-3">
          <SeoSnapshotForm />
          <IndexNowSubmitButton />
        </div>
      </div>

      {/* Внешние панели */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Внешние панели</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <a
              href="https://webmaster.yandex.ru/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              Яндекс.Вебмастер
            </a>{" "}
            — полная статистика запросов, переобход, диагностика
          </li>
          <li>
            <a
              href="https://metrika.yandex.ru/dashboard?id=111282352"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              Яндекс.Метрика
            </a>{" "}
            — поведение, конверсии, полные отчёты
          </li>
          <li>
            <a
              href="https://business.yandex.ru/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              Яндекс Бизнес
            </a>{" "}
            — карточка и отзывы (главный рычаг локальной выдачи)
          </li>
        </ul>
      </Card>
    </div>
  );
}
