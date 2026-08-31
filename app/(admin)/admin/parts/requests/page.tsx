export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { PartRequestHandleButton } from "@/components/admin/PartRequestHandleButton";
import { formatDateTime } from "@/lib/utils";

interface RequestRow {
  id: string;
  oem: string;
  partName: string;
  contact: string;
  note: string | null;
  createdAt: Date;
  handledAt: Date | null;
  referenceId: string | null;
  handledBy: { name: string | null; email: string } | null;
}

export default async function PartRequestsPage() {
  // requireRole здесь нельзя: он бросает, и страница падает необработанной
  // ошибкой вместо входа (конвенция проекта).
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login?from=/admin/parts/requests");
  }

  const rows = (await db.partRequest.findMany({
    select: {
      id: true,
      oem: true,
      partName: true,
      contact: true,
      note: true,
      createdAt: true,
      handledAt: true,
      referenceId: true,
      handledBy: { select: { name: true, email: true } },
    },
    // Необработанные сверху, внутри — свежие первыми: это рабочий список, а не
    // архив, и открывают его чтобы понять, кому ещё не ответили.
    orderBy: [{ handledAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  })) as RequestRow[];

  const open = rows.filter((r) => r.handledAt === null);
  const done = rows.filter((r) => r.handledAt !== null);

  return (
    <div>
      <PageHeader
        eyebrow="Запчасти"
        title="Заявки на детали"
        description="Посетитель нашёл деталь по номеру, а в наличии её не было. Автоуведомлений мы не шлём — связывается сотрудник."
      />

      {rows.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Заявок пока нет</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm uppercase tracking-wide text-[var(--foreground-muted)] mb-2">
              Не обработаны · {open.length}
            </h2>
            {open.length === 0 ? (
              <Card className="py-6 text-sm text-[var(--foreground-muted)]">
                Все заявки обработаны
              </Card>
            ) : (
              <div className="space-y-2">
                {open.map((r) => (
                  <Row key={r.id} r={r} userId={session.id} />
                ))}
              </div>
            )}
          </section>

          {done.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wide text-[var(--foreground-muted)] mb-2">
                Обработаны · {done.length}
              </h2>
              <div className="space-y-2 opacity-70">
                {done.map((r) => (
                  <Row key={r.id} r={r} userId={session.id} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ r, userId }: { r: RequestRow; userId: string }): React.ReactElement {
  return (
    <div className="card flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="font-medium">
          {r.partName}{" "}
          <span className="font-mono text-xs text-[var(--foreground-muted)]">{r.oem}</span>
        </p>
        {/* Контакт выделяем: за ним сюда и приходят. */}
        <p className="text-sm mt-1 select-all">{r.contact}</p>
        {r.note && <p className="text-sm text-[var(--foreground-muted)] mt-1">{r.note}</p>}
        <p className="text-xs text-[var(--foreground-muted)] mt-1">
          {formatDateTime(r.createdAt)}
          {r.handledAt && ` · обработана ${formatDateTime(r.handledAt)}`}
          {r.handledBy && ` · ${r.handledBy.name ?? r.handledBy.email}`}
          {/* Номенклатуру могли удалить — снимок номера в строке остаётся. */}
          {!r.referenceId && " · позиция удалена из справочника"}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        {r.referenceId && (
          <Link href={`/admin/parts/refs/${r.referenceId}`} className="btn btn-secondary btn-sm">
            Позиция
          </Link>
        )}
        {r.handledAt === null && <PartRequestHandleButton id={r.id} userId={userId} />}
      </div>
    </div>
  );
}
