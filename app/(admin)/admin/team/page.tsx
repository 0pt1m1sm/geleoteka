export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function TeamPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const masters = await db.masterProfile.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Команда</h1>

      <div className="space-y-4">
        {masters.map((m: Record<string, unknown>) => (
          <div key={m.id as string} className="card flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-secondary)] flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[var(--foreground-muted)]">
                {(m.name as string)
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-medium">{m.name as string}</p>
              <p className="text-sm text-[var(--color-accent)]">{m.role as string}</p>
              {m.bio ? <p className="text-sm text-[var(--foreground-muted)] mt-1">{m.bio as string}</p> : null}
              {m.experience ? <p className="text-xs text-[var(--foreground-muted)]">Опыт: {m.experience as number} лет</p> : null}
              <div className="flex flex-wrap gap-1 mt-2">
                {(m.certifications as string[]).map((cert: string) => (
                  <span key={cert} className="badge badge-silver text-[10px]">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
            <span
              className={`badge text-[10px] ${
                (m.isActive as boolean)
                  ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                  : "bg-[var(--color-error-bg)] text-[var(--color-error)]"
              }`}
            >
              {(m.isActive as boolean) ? "Активен" : "Неактивен"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
