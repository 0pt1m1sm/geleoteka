export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { REPAIR_ORDER_STATUS_LABELS, formatDate, formatPrice } from "@/lib/utils";
import { getAllCustomerTags } from "@/lib/customer-queries";
import { getTagBadgeClass } from "@/lib/customer-tags";
import { CustomerEditForm } from "@/components/admin/customers/CustomerEditForm";
import { CustomerTagsManager } from "@/components/admin/customers/CustomerTagsManager";
import { CustomerNotesTimeline, type TimelineNote } from "@/components/admin/customers/CustomerNotesTimeline";
import { CommunicationLogger } from "@/components/crm/CommunicationLogger";
import { CrmTaskList } from "@/components/crm/CrmTaskList";

interface Props {
  params: Promise<{ id: string }>;
}

interface RawCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicles: Array<{ id: string; model: string; year: number; vin: string | null }>;
  loyaltyAccount: { points: number } | null;
  customerProfile: { blacklisted: boolean; notes: string | null } | null;
  repairOrders: Array<{
    id: string;
    dateTime: Date;
    status: string;
    total: number;
    vehicle: { model: string };
    jobLines: Array<{ description: string; status: string }>;
  }>;
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
}

export default async function CustomerDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }
  const { id } = await params;

  const [customerRaw, availableTags, commLogs, tasks] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        vehicles: { where: { ownershipType: "CUSTOMER" } },
        loyaltyAccount: true,
        customerProfile: true,
        repairOrders: {
          include: {
            vehicle: { select: { model: true } },
            jobLines: { select: { description: true, status: true } },
          },
          orderBy: { dateTime: "desc" },
          take: 20,
        },
        customerNotes: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { author: { select: { id: true, name: true } } },
        },
        tagAssignments: {
          include: { tag: { select: { id: true, name: true, colorSlug: true } } },
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Автомобили</p>
          <p className="text-2xl font-bold">{customer.vehicles.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Визиты</p>
          <p className="text-2xl font-bold">{customer.repairOrders.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Баллы</p>
          <p className="text-2xl font-bold">{points}</p>
        </div>
      </div>

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
          initialEntries={commLogs.map((e) => ({
            id: e.id,
            channel: e.channel,
            outcome: e.outcome,
            body: e.body,
            durationSec: e.durationSec,
            createdAt: e.createdAt,
            author: e.author,
            deal: e.deal,
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

      <h2 className="text-lg font-semibold mb-3">История заказ-нарядов</h2>
      <div className="space-y-3">
        {customer.repairOrders.map((ro) => (
          <div key={ro.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{formatDate(ro.dateTime)}</p>
                <p className="text-sm text-[var(--foreground-muted)]">{ro.vehicle.model}</p>
              </div>
              <span className={`badge text-xs status-${ro.status.toLowerCase()}`}>
                {REPAIR_ORDER_STATUS_LABELS[ro.status] ?? ro.status}
              </span>
            </div>
            {ro.total > 0 ? (
              <p className="text-sm mt-2">Стоимость: {formatPrice(ro.total)}</p>
            ) : null}
          </div>
        ))}
        {customer.repairOrders.length === 0 ? (
          <div className="card text-sm text-[var(--foreground-muted)]">— нет —</div>
        ) : null}
      </div>
    </div>
  );
}
