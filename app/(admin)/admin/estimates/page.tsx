export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate, JOB_LINE_STATUS_LABELS } from "@/lib/utils";
import { Button, PageHeader } from "@/components/ui";

export default async function AdminEstimatesPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const estimates = await db.repairOrder.findMany({
    where: { status: "ESTIMATE" },
    include: {
      user: { select: { name: true } },
      vehicle: { select: { model: true } },
      jobLines: { select: { id: true, status: true, total: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Сервис"
        title="Сметы"
        actions={
          <Link href="/admin/estimates/new">
            <Button size="sm" leftIcon={<Plus size={14} />}>Создать смету</Button>
          </Link>
        }
      />

      {estimates.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Смет пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {estimates.map((ro: Record<string, unknown>) => {
            const user = ro.user as { name: string };
            const vehicle = ro.vehicle as { model: string };
            const jobs = ro.jobLines as Array<{ id: string; status: string; total: number }>;
            const approvedCount = jobs.filter((j) => j.status === "APPROVED").length;
            const declinedCount = jobs.filter((j) => j.status === "DECLINED").length;
            const proposedCount = jobs.filter((j) => j.status === "PROPOSED").length;

            return (
              <div key={ro.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {user.name} — {vehicle.model}
                    </p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(ro.createdAt as Date)}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      {proposedCount > 0 && (
                        <span className="badge badge-silver text-[10px]">
                          {JOB_LINE_STATUS_LABELS.PROPOSED}: {proposedCount}
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="badge text-[10px] bg-[var(--color-success-bg)] text-[var(--color-success)]">
                          {JOB_LINE_STATUS_LABELS.APPROVED}: {approvedCount}
                        </span>
                      )}
                      {declinedCount > 0 && (
                        <span className="badge text-[10px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
                          {JOB_LINE_STATUS_LABELS.DECLINED}: {declinedCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-accent)]">
                      {formatPrice(ro.total as number)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
