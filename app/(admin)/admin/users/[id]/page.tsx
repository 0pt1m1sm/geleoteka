export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { UserContactsForm } from "@/components/admin/UserContactsForm";
import { UserAdminActions } from "@/components/admin/UserAdminActions";

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

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  CLIENT: "Клиент",
  NONE: "Без доступа",
};

export default async function UserDetailPage({ params }: Props) {
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

  const flags: string[] = [];
  if (user.isCustomer) flags.push("Клиент");
  if (user.isMaster) flags.push("Мастер");

  const viewerIsAdmin = session.permissionRole === "ADMIN";
  const isSelf = session.id === user.id;
  const roleLabel = ROLE_LABEL[user.permissionRole] ?? user.permissionRole;

  return (
    <div>
      <PageHeader
        eyebrow="Пользователи"
        title={user.name}
        description={`${roleLabel}${flags.length > 0 ? ` · ${flags.join(", ")}` : ""}`}
        actions={
          <Link href="/admin/users" className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            ← К списку
          </Link>
        }
      />

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
