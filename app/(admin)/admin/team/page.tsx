export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { Button, Card, PageHeader } from "@/components/ui";
import { DeleteTeamMemberButton } from "@/components/admin/DeleteTeamMemberButton";

interface MemberRow {
  id: string;
  name: string;
  role: string | null;
  isActive: boolean;
  sortOrder: number;
  certifications: string[];
}

export default async function AdminTeamPage() {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);

  const members = (await db.teamMember.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      sortOrder: true,
      certifications: true,
    },
  })) as MemberRow[];

  const activeCount = members.filter((m) => m.isActive).length;

  return (
    <div>
      <PageHeader
        eyebrow="Сайт"
        title="Команда"
        description={`Всего: ${members.length} · На сайте: ${activeCount}`}
        actions={
          <Link href="/admin/team/new">
            <Button size="sm" leftIcon={<Plus size={14} />}>Добавить</Button>
          </Link>
        }
      />

      {members.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-4">В команде пока никого</p>
          <Link href="/admin/team/new">
            <Button size="sm">Добавить первого</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <div key={m.id} className="card flex items-center justify-between gap-4">
              <Link
                href={`/admin/team/${m.id}`}
                className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">{m.name}</p>
                  {!m.isActive && (
                    <span className="badge text-[10px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
                      Скрыт
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  {m.role ?? "без должности"} · {m.certifications.length} сертификатов · сорт. {m.sortOrder}
                </p>
              </Link>
              <DeleteTeamMemberButton memberId={m.id} memberName={m.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
