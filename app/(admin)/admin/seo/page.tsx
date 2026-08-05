export const dynamic = "force-dynamic";

import Link from "next/link";

import { SeoSnapshotForm } from "@/components/admin/SeoSnapshotForm";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { collectSeoHealth, withDelta } from "@/lib/seo-health";

interface SnapshotRow {
  id: string;
  createdAt: Date;
  sitemapUrls: number | null;
  servicesWithBody: number;
  servicesTotal: number;
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
  await requireRole(["ADMIN", "MANAGER"]);

  const [health, snapshots] = await Promise.all([
    collectSeoHealth(),
    db.seoSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        sitemapUrls: true,
        servicesWithBody: true,
        servicesTotal: true,
        postsPublished: true,
        postsDraft: true,
        indexedPages: true,
        note: true,
      },
    }) as Promise<SnapshotRow[]>,
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Сайт"
        title="SEO"
        description="Техническое состояние продвижения и история замеров. Позиции в выдаче Яндекс не отдаёт автоматически — их вносим в замер вручную."
      />

      {/* Живой техчек */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Техчек — прямо сейчас</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <StatusPill
            ok={(health.sitemapUrls ?? 0) > 9}
            label={
              health.sitemapUrls == null
                ? "Sitemap недоступен"
                : `Sitemap: ${health.sitemapUrls} URL`
            }
          />
          <StatusPill ok={health.metrikaConfigured} label="Метрика подключена" />
          <StatusPill ok={health.indexnowConfigured} label="IndexNow настроен" />
          <StatusPill
            ok={health.servicesWithBody === health.servicesTotal}
            label={`Тексты услуг: ${health.servicesWithBody}/${health.servicesTotal}`}
          />
          <StatusPill
            ok={health.postsPublished > 0}
            label={`Статьи: ${health.postsPublished} опубл. / ${health.postsDraft} черн.`}
          />
          <StatusPill
            ok={health.verificationConfigured}
            label="Верификация meta-тегом (файл — всегда активен)"
          />
        </div>
        {health.postsDraft > 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] mt-4">
            {health.postsDraft}{" "}
            {health.postsDraft === 1 ? "черновик ждёт" : "черновиков ждут"} вычитки в{" "}
            <Link href="/admin/blog" className="text-[var(--color-accent)] hover:underline">
              Статьях
            </Link>
            . Публикуйте по 2–3 в неделю — равномерность выглядит естественнее для поиска.
          </p>
        ) : null}
      </Card>

      {/* Новый замер */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Новый замер</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-3">
          «Страниц в индексе» — из поиска Яндекса по запросу{" "}
          <code className="font-mono text-xs">site:geleoteka.ru</code> (число результатов).
        </p>
        <SeoSnapshotForm />
      </div>

      {/* История */}
      <div>
        <h2 className="text-lg font-semibold mb-3">История замеров</h2>
        {snapshots.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--foreground-muted)]">
              Замеров пока нет — снимите первый, чтобы было с чем сравнивать.
            </p>
          </Card>
        ) : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium">В индексе</th>
                  <th className="px-4 py-2 font-medium">Sitemap</th>
                  <th className="px-4 py-2 font-medium">Тексты услуг</th>
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
                      </td>
                      <td className="px-4 py-2">{withDelta(s.indexedPages, prev?.indexedPages)}</td>
                      <td className="px-4 py-2">{withDelta(s.sitemapUrls, prev?.sitemapUrls)}</td>
                      <td className="px-4 py-2">
                        {s.servicesWithBody}/{s.servicesTotal}
                      </td>
                      <td className="px-4 py-2">
                        {withDelta(s.postsPublished, prev?.postsPublished)} опубл. / {s.postsDraft}{" "}
                        черн.
                      </td>
                      <td className="px-4 py-2 max-w-[320px] truncate" title={s.note ?? ""}>
                        {s.note ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Внешние панели и чек-лист */}
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
            — страницы в поиске, запросы и позиции, переобход
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
            — трафик из поиска, поисковые фразы
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
            — карточка, показы, отзывы (отвечать ≤48ч)
          </li>
        </ul>
        <p className="text-xs text-[var(--foreground-muted)] mt-4">
          Постоянные рычаги: отзывы на картах (сильнее всего двигают локальную выдачу),
          вычитка и публикация черновиков, ответы на отзывы.
        </p>
      </Card>
    </div>
  );
}
