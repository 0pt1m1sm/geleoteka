export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function AdminPartsPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const parts = await db.part.findMany({
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Запчасти"
        title="Каталог"
        description={`Всего: ${parts.length} · В наличии: ${parts.filter((p: Record<string, unknown>) => (p.quantity as number) > 0).length}`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/parts/import">
              <Button variant="secondary" size="sm">Импорт CSV</Button>
            </Link>
            <Link href="/admin/parts/new">
              <Button size="sm" leftIcon={<Plus size={14} />}>Добавить</Button>
            </Link>
          </div>
        }
      />

      {parts.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Запчастей пока нет</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {parts.map((part: Record<string, unknown>) => {
            const cat = part.category as Record<string, string> | null;
            return (
              <Link
                key={part.id as string}
                href={`/admin/parts/${part.id as string}`}
                className="card card-hover flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{part.name as string}</p>
                    {!(part.isActive as boolean) && (
                      <span className="badge text-[10px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
                        Скрыта
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] font-mono">
                    {part.article as string}
                    {cat && ` · ${cat.name}`}
                    {(part.isOEM as boolean) ? " · OEM" : " · Аналог"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[var(--color-accent)]">
                    {formatPrice(part.price as number)}
                  </p>
                  <p className={`text-xs ${(part.quantity as number) > 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                    {(part.quantity as number) > 0 ? `${part.quantity} шт.` : "Нет в наличии"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
