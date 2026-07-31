export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { EraseCustomerPanel } from "@/components/admin/customers/EraseCustomerPanel";
import { db } from "@/lib/db";
import { entityFlags, roleLabel as roleLabelOf } from "@/lib/roles";
import { Card, PageHeader } from "@/components/ui";

interface UserRow {
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
}

interface SearchParams {
  role?: string;
  q?: string;
}

const ROLE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Все" },
  { value: "ADMIN", label: "Администраторы" },
  { value: "MANAGER", label: "Менеджеры" },
  { value: "CLIENT", label: "Клиенты" },
  { value: "NONE", label: "Заблокированы" },
];


const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  MANAGER: "bg-[var(--color-info-bg,rgba(59,130,246,0.12))] text-[var(--color-info,#3b82f6)]",
  CLIENT: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  MASTER: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  WAREHOUSE_WORKER: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  NONE: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
};

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function UsersAdminPage({ searchParams }: Props) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  // Erasing is ADMIN-only (see eraseCustomer), so a manager sees no button
  // rather than one that always refuses.
  const viewerIsAdmin = session.permissionRole === "ADMIN";
  const sp = await searchParams;
  const filter = sp.role ?? "all";
  const q = (sp.q ?? "").trim();

  const where: Record<string, unknown> = {};
  if (filter !== "all") {
    where.permissionRole = filter;
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }
  // Suppliers are pure data entities — exclude from user listing.
  where.isSupplier = false;

  const users = (await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
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
    },
  })) as UserRow[];

  return (
    <div>
      <PageHeader
        eyebrow="Пользователи"
        title="Управление аккаунтами"
        description={`Найдено: ${users.length}${users.length >= 200 ? " (показаны последние 200)" : ""}`}
      />

      <form className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((r) => {
            const active = filter === r.value;
            const params = new URLSearchParams();
            if (r.value !== "all") params.set("role", r.value);
            if (q) params.set("q", q);
            const href = `/admin/users${params.toString() ? `?${params.toString()}` : ""}`;
            return (
              <Link
                key={r.value}
                href={href}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-[var(--color-accent)] text-black border-[var(--color-accent)]"
                    : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Поиск по имени, email или телефону…"
          className="input flex-1 min-w-[220px] max-w-md"
        />
        {filter !== "all" && <input type="hidden" name="role" value={filter} />}
        <button type="submit" className="btn btn-secondary text-sm">
          Найти
        </button>
      </form>

      {users.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            {q ? "Никто не найден по запросу" : "Пользователей с такой ролью нет"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const roleLabel = roleLabelOf(u.permissionRole);
            const badgeClass =
              ROLE_BADGE_CLASS[u.permissionRole] ??
              "bg-[var(--background-secondary)] text-[var(--foreground-muted)]";
            const flags = entityFlags(u, u.permissionRole).map((f) => f.toLowerCase());
            return (
              <div
                key={u.id}
                className="card flex items-center justify-between gap-4"
              >
                <Link href={`/admin/users/${u.id}`} className="flex-1 min-w-0 hover:opacity-80">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium truncate">{u.name}</p>
                    <span className={`badge text-[10px] ${badgeClass}`}>{roleLabel}</span>
                    {u.isTempPassword && u.permissionRole !== "NONE" && (
                      <span className="badge text-[10px] bg-[var(--color-warning-bg,rgba(245,158,11,0.12))] text-[var(--color-warning,#f59e0b)]">
                        Временный пароль
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] font-mono truncate">
                    {u.email} · {u.phone}
                    {flags.length > 0 ? ` · ${flags.join(", ")}` : ""}
                  </p>
                </Link>
                {/* Staff too: a master is the same row as a client with another
                    role. Suppliers and admins are refused by the action itself. */}
                {viewerIsAdmin &&
                u.id !== session.id &&
                !u.isSupplier &&
                u.permissionRole !== "ADMIN" ? (
                  <div className="shrink-0">
                    <EraseCustomerPanel
                      customerUserId={u.id}
                      customerName={u.name}
                      confirmPhrase={u.email ?? u.phone ?? ""}
                      redirectTo="/admin/users"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
