export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { RolesTable, type RoleRow } from "@/components/admin/RolesTable";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Access control in one place: who holds which role, and what each role opens.
 *
 * Roles were previously only reachable one user at a time from a user's detail
 * page, which made "who can actually get into the admin panel?" a question you
 * answered by clicking through every row. ADMIN-only, because changing a role
 * grants access — a MANAGER may not do it (changeUserRole enforces this too).
 */

const ROLE_MEANING: Readonly<Record<string, string>> = {
  ADMIN: "Полный доступ, включая настройки и доступы",
  MANAGER: "Админ-панель: заказы, CRM, клиенты. Без настроек и ролей",
  MASTER: "Портал мастера — свои заказ-наряды",
  WAREHOUSE_WORKER: "Только склад",
  CLIENT: "Личный кабинет клиента",
  NONE: "Вход запрещён",
};

/** Staff first — the roles that grant access are the ones worth auditing. */
const ROLE_ORDER = ["ADMIN", "MANAGER", "MASTER", "WAREHOUSE_WORKER", "CLIENT", "NONE"] as const;

export default async function RolesPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.permissionRole !== "ADMIN") redirect("/admin");

  const rows = (await db.user.findMany({
    where: {
      deletedAt: null,
      isSupplier: false,
      // Customers are the bulk of the table and their role is never in
      // question; this page is about who has elevated access.
      permissionRole: { in: ["ADMIN", "MANAGER", "MASTER", "WAREHOUSE_WORKER"] },
    },
    orderBy: [{ permissionRole: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, phone: true, permissionRole: true },
  })) as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    permissionRole: string;
  }>;

  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.permissionRole, (counts.get(r.permissionRole) ?? 0) + 1);
  }

  const staff: RoleRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    contact: r.email ?? r.phone ?? "—",
    permissionRole: r.permissionRole,
    isSelf: r.id === session.id,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Доступы"
        title="Роли"
        description="Кто и что может делать в системе. Менять роли может только администратор."
      />

      <Card className="mb-6">
        <h2 className="text-sm font-semibold mb-3">Что означает роль</h2>
        <ul className="space-y-1.5 text-sm">
          {ROLE_ORDER.map((role) => (
            <li key={role} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{ROLE_LABELS[role] ?? role}</span>
              <span className="text-[var(--foreground-muted)]">— {ROLE_MEANING[role]}</span>
              {counts.get(role) ? (
                <span className="text-xs text-[var(--foreground-muted)]">
                  ({counts.get(role)})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <RolesTable rows={staff} />
    </div>
  );
}
