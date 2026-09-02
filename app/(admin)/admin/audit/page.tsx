export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { TENANT_KEY } from "@/lib/tenant";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit";
import { Card, PageHeader } from "@/components/ui";
import { UrlParamSelect } from "@/components/shared/UrlParamSelect";
import { formatDateTime } from "@/lib/utils";

/**
 * Кто что сделал.
 *
 * Только чтение — журнал append-only, и страница, умеющая его править, обесценила
 * бы его целиком. Фильтры серверные, через query-параметры: ссылку на
 * «все удаления за этот период» можно переслать, а не пересобирать руками.
 */

const PAGE_SIZE = 100;

interface Row {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: Date;
}

interface Props {
  searchParams: Promise<{ action?: string; actor?: string; days?: string }>;
}

/** Что показать под строкой: короткая выжимка, а не дамп JSON. */
function summarise(action: string, metadata: unknown): string | null {
  const m = (metadata ?? {}) as Record<string, unknown>;
  switch (action) {
    case "user.role_change":
      return `${String(m.from ?? "?")} → ${String(m.to ?? "?")}`;
    case "user.block":
      return m.disabled === true ? "доступ закрыт" : "доступ восстановлен";
    case "customer.erase": {
      const related = m.deleteRelated === true;
      const counts = (m.counts ?? {}) as Record<string, number>;
      const attached = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(", ");
      const mode = related ? "вместе со связанными записями" : "с отвязкой записей";
      return attached ? `${mode} (${attached})` : mode;
    }
    case "role.permissions_set": {
      const granted = Array.isArray(m.granted) ? (m.granted as string[]) : [];
      return granted.length > 0 ? `разрешено: ${granted.join(", ")}` : "все права сняты";
    }
    case "deal.delete":
      return `стадия ${String(m.stage ?? "?")}${
        m.deleteFulfillment === true ? ", вместе с исполнением" : ""
      }`;
    case "estimate.delete":
      return `стадия ${String(m.stage ?? "?")}`;
    case "vehicle.delete": {
      const ro = Number(m.detachedRepairOrders ?? 0);
      return ro > 0 ? `отвязано заказ-нарядов: ${ro}` : null;
    }
    case "telegram.webhook_reply_failed":
      return `Код: ${String(m.errorCode ?? "?")} · HTTP: ${
        m.httpStatus === null ? "нет ответа" : String(m.httpStatus ?? "?")
      }`;
    default:
      return null;
  }
}

export default async function AuditPage({ searchParams }: Props): Promise<React.ReactElement> {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "audit.view"))) redirect("/admin");

  const { action, actor, days } = await searchParams;
  const windowDays = Number(days) > 0 ? Number(days) : 30;
  // `new Date()` — как на остальных страницах админки: правило чистоты
  // рендера запрещает Date.now(), а окно всё равно считается один раз за запрос.
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const where: Record<string, unknown> = { tenantKey: TENANT_KEY, createdAt: { gte: since } };
  if (action && action in AUDIT_ACTION_LABELS) where.action = action;
  if (actor) where.actorUserId = actor;

  const rows = (await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  })) as Row[];

  // Список исполнителей строится из самого журнала, а не из таблицы
  // пользователей: удалённый администратор должен остаться в фильтре, иначе
  // его действия станет нечем отобрать.
  const actors = new Map<string, string>();
  for (const r of rows) if (r.actorUserId) actors.set(r.actorUserId, r.actorName);

  // Действие, попавшее в фильтр, могло не встретиться среди актёров текущей
  // выборки — селект «Кто» всё равно должен показывать выбор, а не съезжать.
  if (actor && !actors.has(actor)) actors.set(actor, "выбранный сотрудник");

  return (
    <div>
      <PageHeader
        eyebrow="Доступы"
        title="Журнал действий"
        description="Удаления, смены ролей и изменения прав. Запись только добавляется — править её нельзя."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <UrlParamSelect
          param="action"
          value={action && action in AUDIT_ACTION_LABELS ? action : ""}
          ariaLabel="Фильтр по действию"
          options={[
            { value: "", label: "Все действия" },
            ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <UrlParamSelect
          param="days"
          value={String(windowDays)}
          ariaLabel="Период"
          options={[7, 30, 90, 365].map((d) => ({ value: String(d), label: `За ${d} дн.` }))}
        />
        {actors.size > 0 && (
          <UrlParamSelect
            param="actor"
            value={actor ?? ""}
            ariaLabel="Фильтр по сотруднику"
            options={[
              { value: "", label: "Любой сотрудник" },
              ...[...actors].map(([value, label]) => ({ value, label })),
            ]}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="text-sm text-[var(--foreground-muted)]">
          За выбранный период записей нет.
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => {
              const detail = summarise(r.action, r.metadata);
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium">
                      {AUDIT_ACTION_LABELS[r.action as AuditAction] ?? r.action}
                    </span>
                    {r.targetLabel ? (
                      <span className="text-[var(--foreground)]">· {r.targetLabel}</span>
                    ) : null}
                    <span className="ml-auto text-xs text-[var(--foreground-muted)] font-mono">
                      {formatDateTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {r.actorName} · {r.actorRole}
                    {r.ip ? <span className="font-mono"> · {r.ip}</span> : null}
                  </div>
                  {detail ? <div className="text-xs mt-0.5">{detail}</div> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {rows.length === PAGE_SIZE ? (
        <p className="text-xs text-[var(--foreground-muted)] mt-3">
          Показаны последние {PAGE_SIZE} записей за период. Сузьте фильтр, чтобы увидеть более
          ранние.
        </p>
      ) : null}
    </div>
  );
}
