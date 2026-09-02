export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { allRolePermissions, rolesUsingDefaults } from "@/lib/authz";
import { EDITABLE_ROLES, PERMISSIONS, type Permission } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { Card, PageHeader } from "@/components/ui";
import { RolePermissionsEditor } from "@/components/admin/roles/RolePermissionsEditor";

/**
 * What each role opens, and the place to change it.
 *
 * This page used to list PEOPLE grouped by role, which answered "who is a
 * manager" — something the users list already answers — while the thing the
 * page is named after, the rights themselves, lived only in code and could not
 * be changed without a deploy. Now the rights ARE the page and the holders are
 * a count beside them.
 *
 * ADMIN-only, because editing a role grants access.
 */

const ROLE_NOTE: Readonly<Record<string, string>> = {
  ADMIN:
    "Полный доступ ко всему, включая эту страницу. Не редактируется: иначе администратор мог бы снять с себя право на роли и обратно уже не попал бы.",
  MANAGER:
    "Работа с клиентами и заказами. По умолчанию — всё, кроме настроек, контента сайта и этой страницы.",
  MASTER:
    "По умолчанию не открывает админ-панель вообще — до сих пор мастеров в неё не пускали. Выдать доступ можно здесь.",
  WAREHOUSE_WORKER: "По умолчанию только склад.",
};

export default async function RolesPage(): Promise<React.ReactElement> {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.permissionRole !== "ADMIN") redirect("/admin");

  // Counted in JS rather than with groupBy: the aggregate's types do not
  // survive the db singleton, and the staff table is small enough that the
  // round-trip is the cost, not the loop.
  const holders = (await db.user.findMany({
    where: { deletedAt: null, isSupplier: false },
    select: { permissionRole: true },
  })) as Array<{ permissionRole: string }>;
  const holderCount = new Map<string, number>();
  for (const h of holders) {
    holderCount.set(h.permissionRole, (holderCount.get(h.permissionRole) ?? 0) + 1);
  }

  const permissions = await allRolePermissions(EDITABLE_ROLES);
  const usingDefaults = await rolesUsingDefaults(EDITABLE_ROLES);

  return (
    <div>
      <PageHeader
        eyebrow="Доступы"
        title="Роли и права"
        description="Что открывает каждая роль. Изменения действуют сразу — и на меню, и на прямой переход по адресу."
        actions={
          <Link href="/admin/users" className="back-link">
            Пользователи →
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="font-semibold">{ROLE_LABELS.ADMIN}</h2>
            <span className="text-xs text-[var(--foreground-muted)]">
              {holderCount.get("ADMIN") ?? 0} чел.
            </span>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">{ROLE_NOTE.ADMIN}</p>
        </Card>

        {EDITABLE_ROLES.map((role) => {
          const granted = [...(permissions.get(role) ?? new Set<string>())].filter(
            (p): p is Permission => (PERMISSIONS as readonly string[]).includes(p),
          );
          return (
            <Card key={role}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="font-semibold">
                  {ROLE_LABELS[role]}
                  {usingDefaults.has(role) ? (
                    <span className="ml-2 badge text-[10px] bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                      по умолчанию
                    </span>
                  ) : null}
                </h2>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {holderCount.get(role) ?? 0} чел.
                </span>
              </div>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">{ROLE_NOTE[role]}</p>
              <RolePermissionsEditor
                role={role}
                roleLabel={ROLE_LABELS[role]}
                initial={granted}
                usingDefaults={usingDefaults.has(role)}
              />
            </Card>
          );
        })}

        <Card>
          <h2 className="font-semibold mb-1">
            {ROLE_LABELS.CLIENT} и {ROLE_LABELS.NONE}
          </h2>
          <p className="text-sm text-[var(--foreground-muted)]">
            Админ-панель не открывают ни при каких правах: «{ROLE_LABELS.CLIENT}» — это вход в
            личный кабинет, «{ROLE_LABELS.NONE}» — вход закрыт полностью. Сейчас таких{" "}
            {(holderCount.get("CLIENT") ?? 0) + (holderCount.get("NONE") ?? 0)} чел.
          </p>
        </Card>
      </div>
    </div>
  );
}
