export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { entityFlags, roleLabel as roleLabelOf } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { UserContactsForm } from "@/components/admin/UserContactsForm";
import { UserAdminActions } from "@/components/admin/UserAdminActions";
import { UserActionsMenu } from "@/components/admin/users/UserActionsMenu";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  permissionRole: string;
  isCustomer: boolean;
  isMaster: boolean;
  isSupplier: boolean;
  isTempPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  params: Promise<{ id: string }>;
}

const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  MANAGER: "bg-[var(--color-info-bg,rgba(59,130,246,0.12))] text-[var(--color-info,#3b82f6)]",
  CLIENT: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  MASTER: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  WAREHOUSE_WORKER: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  NONE: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
};


export default async function UserDetailPage({ params }: Props) {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const user = (await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      permissionRole: true,
      isCustomer: true,
      isMaster: true,
      isSupplier: true,
      isTempPassword: true,
      createdAt: true,
      updatedAt: true,
    },
  })) as UserDetail | null;

  if (!user) notFound();
  if (user.isSupplier) {
    // Suppliers are non-login data entities — redirect to their CRM-style page.
    notFound();
  }

  const flags = entityFlags(user, user.permissionRole);

  const viewerIsAdmin = session.permissionRole === "ADMIN";
  const isSelf = session.id === user.id;
  const roleLabel = roleLabelOf(user.permissionRole);
  // Mirrors the action's own refusals, so the menu never offers a delete that
  // would come back as an error: not yourself, not another admin, not a
  // supplier (SupplierOrder.userId is a required link this flow won't unpick).
  const canErase =
    viewerIsAdmin && !isSelf && !user.isSupplier && user.permissionRole !== "ADMIN";

  return (
    <div>
      <PageHeader
        eyebrow="Пользователи"
        title={user.name}
        description={flags.length > 0 ? flags.join(" · ") : undefined}
        actions={
          <div className="flex items-center gap-3">
            <Link href="/admin/users" className="back-link">
              ← К списку
            </Link>
            {canErase ? (
              <UserActionsMenu
                userId={user.id}
                userName={user.name}
                confirmPhrase={user.email ?? user.phone ?? ""}
                redirectTo="/admin/users"
              />
            ) : null}
          </div>
        }
      />

      {/* Role is what this page is mostly about — show it as a badge rather than
          as grey text in the subtitle, matching how the list renders it. */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xs text-[var(--foreground-muted)]">Роль:</span>
        <span
          className={`badge text-[11px] ${
            ROLE_BADGE_CLASS[user.permissionRole] ??
            "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"
          }`}
        >
          {roleLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UserContactsForm
          userId={user.id}
          initial={{ name: user.name, email: user.email, phone: user.phone }}
        />
        <UserAdminActions
          userId={user.id}
          userName={user.name}
          currentRole={user.permissionRole}
          viewerIsAdmin={viewerIsAdmin}
          isSelf={isSelf}
        />
      </div>

      {user.isCustomer && (
        <div className="mt-6 card">
          <p className="text-sm text-[var(--foreground-muted)]">
            Этот пользователь — клиент. Заметки, теги и история заказов в
            CRM:{" "}
            <Link
              href={`/admin/customers/${user.id}`}
              className="text-[var(--color-accent)] hover:underline"
            >
              Открыть карточку клиента →
            </Link>
          </p>
        </div>
      )}

      <div className="mt-6 text-xs text-[var(--foreground-muted)]">
        Создан: {user.createdAt.toLocaleString("ru-RU")} · Обновлён:{" "}
        {user.updatedAt.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}
