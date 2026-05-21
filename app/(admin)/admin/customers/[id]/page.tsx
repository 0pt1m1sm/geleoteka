export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/utils";
import { getAllCustomerTags } from "@/lib/customer-queries";
import { getTagBadgeClass } from "@/lib/customer-tags";
import { CustomerEditForm } from "@/components/admin/customers/CustomerEditForm";
import { CustomerTagsManager } from "@/components/admin/customers/CustomerTagsManager";
import { CustomerContactsManager } from "@/components/admin/customers/CustomerContactsManager";
import { CustomerNotesTimeline, type TimelineNote } from "@/components/admin/customers/CustomerNotesTimeline";
import { DeleteCustomerButton } from "@/components/admin/customers/DeleteCustomerButton";
import { RestoreCustomerButton } from "@/components/admin/customers/RestoreCustomerButton";
import { CommunicationLogger } from "@/components/crm/CommunicationLogger";
import { CrmTaskList } from "@/components/crm/CrmTaskList";
import { REFERRAL_SOURCE_LABELS } from "@/lib/crm-labels";
import { DEAL_STAGE_LABELS, DEAL_CHANNEL_LABELS } from "@/lib/deal-stage-labels";

interface Props {
  params: Promise<{ id: string }>;
}

interface RawCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  referralSource: string | null;
  isTempPassword: boolean;
  deletedAt: Date | null;
  vehicles: Array<{ id: string; model: string; year: number; vin: string | null }>;
  loyaltyAccount: { points: number } | null;
  customerProfile: { blacklisted: boolean; notes: string | null } | null;
  _count: { repairOrders: number };
  customerNotes: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorUserId: string | null;
    author: { id: string; name: string } | null;
  }>;
  tagAssignments: Array<{
    tag: { id: string; name: string; colorSlug: string };
  }>;
  contacts: Array<{ id: string; type: "EMAIL" | "PHONE"; value: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }
  const { id } = await params;

  // NOTE: readAt is flipped by the CommunicationLogger client component AFTER
  // first paint (useEffect → markRepliesRead). Calling it server-side here
  // would flip readAt before the snapshot loads, killing the unread styling.

  const [customerRaw, availableTags, commLogs, tasks, deals] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        vehicles: { where: { ownershipType: "CUSTOMER" } },
        loyaltyAccount: true,
        customerProfile: true,
        _count: { select: { repairOrders: true } },
        customerNotes: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { author: { select: { id: true, name: true } } },
        },
        tagAssignments: {
          include: { tag: { select: { id: true, name: true, colorSlug: true } } },
        },
        contacts: {
          select: { id: true, type: true, value: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    getAllCustomerTags(),
    db.communicationLog.findMany({
      where: { customerUserId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        channel: true,
        outcome: true,
        body: true,
        durationSec: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
        deal: { select: { id: true, number: true } },
        subject: true,
        resendEmailId: true,
        attachments: true,
        readAt: true,
      },
    }),
    db.crmTask.findMany({
      where: { customerUserId: id, status: { in: ["OPEN", "DONE"] } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        kind: true,
        status: true,
        dueAt: true,
        completedAt: true,
        owner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        deal: { select: { id: true, number: true } },
      },
    }),
    db.deal.findMany({
      where: { customerUserId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        number: true,
        stage: true,
        channel: true,
        total: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true } },
        tasks: {
          where: { status: "OPEN" },
          select: { id: true, dueAt: true },
        },
      },
    }) as unknown as Promise<
      Array<{
        id: string;
        number: string | null;
        stage: string;
        channel: string;
        total: number;
        createdAt: Date;
        vehicle: { make: string; model: string } | null;
        tasks: Array<{ id: string; dueAt: Date }>;
      }>
    >,
  ]);
  const nowMs = new Date().valueOf();

  if (!customerRaw) notFound();

  const customer = customerRaw as unknown as RawCustomer;
  const blacklisted = customer.customerProfile?.blacklisted ?? false;
  const profileNotes = customer.customerProfile?.notes ?? "";
  const assignedTags = customer.tagAssignments.map((a) => a.tag);
  const points = customer.loyaltyAccount?.points ?? 0;

  const timelineNotes: TimelineNote[] = customer.customerNotes.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt,
    authorUserId: n.authorUserId,
    authorName: n.author?.name ?? null,
  }));

  return (
    <div>
      {customer.deletedAt ? (
        <div className="alert-error mb-4 text-sm">
          Клиент удалён {formatDate(customer.deletedAt)}. Скрыт из списков; история сохранена.
        </div>
      ) : null}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h1 className="text-display text-2xl font-bold">{customer.name}</h1>
          {blacklisted ? (
            <span className="badge customer-blacklist-badge text-xs">ЧС</span>
          ) : null}
          {assignedTags.map((tag) => (
            <span key={tag.id} className={`badge text-xs ${getTagBadgeClass(tag.colorSlug)}`}>
              {tag.name}
            </span>
          ))}
        </div>
        <p className="text-[var(--foreground-muted)]">
          {customer.phone} · {customer.email}
        </p>
        {customer.referralSource ? (
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Откуда узнал:{" "}
            <span className="text-[var(--foreground)]">
              {REFERRAL_SOURCE_LABELS[customer.referralSource] ?? customer.referralSource}
            </span>
          </p>
        ) : null}
        <p className="mt-2 text-xs">
          <Link
            href={`/admin/users/${customer.id}`}
            className="text-[var(--color-accent)] hover:underline"
          >
            Управление аккаунтом (пароль, роль, блокировка) →
          </Link>
        </p>
      </div>

      <div className="space-y-6 mb-8">
        <CustomerEditForm
          customerUserId={customer.id}
          initial={{
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            notes: profileNotes,
            blacklisted,
          }}
        />

        <CustomerTagsManager
          customerUserId={customer.id}
          assigned={assignedTags}
          availableTags={availableTags}
        />

        <CustomerContactsManager
          customerUserId={customer.id}
          contacts={customer.contacts}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Автомобили</p>
          <p className="text-2xl font-bold">{customer.vehicles.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Визиты</p>
          <p className="text-2xl font-bold">{customer._count.repairOrders}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Баллы</p>
          <p className="text-2xl font-bold">{points}</p>
        </div>
      </div>

      {session.permissionRole === "ADMIN" ? (
        <div className="card mb-8 border-[var(--color-error)]/30">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-error)] mb-2">
            Опасная зона
          </h2>
          {customer.deletedAt ? (
            <>
              <p className="text-sm text-[var(--foreground-muted)] mb-3">
                Клиент скрыт из CRM. Восстановление вернёт его в списки.
              </p>
              <RestoreCustomerButton customerUserId={customer.id} />
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--foreground-muted)] mb-3">
                {customer.isTempPassword
                  ? "Это гостевая запись (без пароля). Удаление безвозвратное — связанные данные тоже исчезнут."
                  : "Удаление скроет клиента из списков. История сделок и заказ-нарядов сохранится."}
              </p>
              <DeleteCustomerButton
                customerUserId={customer.id}
                isGuest={customer.isTempPassword}
              />
            </>
          )}
        </div>
      ) : null}

      <div className="mb-8">
        <CustomerNotesTimeline
          customerUserId={customer.id}
          sessionUserId={session.id}
          sessionRole={session.permissionRole}
          notes={timelineNotes}
        />
      </div>

      <div className="card mb-8">
        <CommunicationLogger
          customerUserId={customer.id}
          customerEmail={customer.email}
          initialEntries={commLogs.map((e) => ({
            id: e.id,
            channel: e.channel,
            outcome: e.outcome,
            body: e.body,
            durationSec: e.durationSec,
            createdAt: e.createdAt,
            author: e.author,
            deal: e.deal,
            subject: e.subject,
            resendEmailId: e.resendEmailId,
            readAt: e.readAt,
            attachments: Array.isArray(e.attachments)
              ? (e.attachments as Array<{ id: string; filename: string; content_type?: string }>)
              : [],
          }))}
        />
      </div>

      <div className="card mb-8">
        <CrmTaskList
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            body: t.body,
            kind: t.kind,
            status: t.status,
            dueAt: t.dueAt,
            completedAt: t.completedAt,
            owner: t.owner,
            customer: t.customer,
            deal: t.deal,
          }))}
          nowMs={nowMs}
          customerUserId={customer.id}
        />
      </div>

      <h2 className="text-lg font-semibold mb-3">Автомобили</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {customer.vehicles.map((v) => (
          <div key={v.id} className="card">
            <p className="font-medium">
              {v.model}, {v.year}
            </p>
            {v.vin ? (
              <p className="text-xs text-[var(--foreground-muted)] font-mono">
                VIN: {v.vin}
              </p>
            ) : null}
          </div>
        ))}
        {customer.vehicles.length === 0 ? (
          <div className="card text-sm text-[var(--foreground-muted)]">— нет —</div>
        ) : null}
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Сделки</h2>
        {deals.length === 0 ? (
          <div className="card text-sm text-[var(--foreground-muted)]">
            У клиента ещё нет сделок.
          </div>
        ) : (
          <div className="card p-0">
            <ul className="divide-y divide-[var(--border)]">
              {deals.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/admin/crm/deals/${d.id}`}
                    className="row-clickable flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {d.number ?? "Без номера"}
                        {d.vehicle ? ` · ${d.vehicle.make} ${d.vehicle.model}` : ""}
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)] mt-0.5 flex flex-wrap gap-x-3 items-center">
                        <span>{DEAL_STAGE_LABELS[d.stage] ?? d.stage}</span>
                        <span>{DEAL_CHANNEL_LABELS[d.channel] ?? d.channel}</span>
                        <span>{formatDate(d.createdAt)}</span>
                        {(() => {
                          const open = d.tasks.length;
                          if (open === 0) return null;
                          const overdue = d.tasks.filter((t) => t.dueAt.getTime() < nowMs).length;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                overdue > 0
                                  ? "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                                  : "bg-[var(--background-secondary)] text-[var(--foreground)]"
                              }`}
                              title={
                                overdue > 0
                                  ? `${open} открытых задач, из них ${overdue} просрочено`
                                  : `${open} открытых задач`
                              }
                            >
                              <ListChecks size={12} aria-hidden />
                              {open}
                              {overdue > 0 ? ` · ${overdue} просроч.` : null}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <span className="text-sm font-medium tabular-nums shrink-0 text-[var(--color-accent)]">
                      {formatPrice(d.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  );
}
