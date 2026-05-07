export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export default async function TeamPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const masters = await db.user.findMany({
    where: { isMaster: true },
    include: { masterProfile: true },
  });

  // Sort by profile.sortOrder
  masters.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const ap = (a.masterProfile as { sortOrder: number } | null)?.sortOrder ?? 0;
    const bp = (b.masterProfile as { sortOrder: number } | null)?.sortOrder ?? 0;
    return ap - bp;
  });

  return (
    <div>
      <PageHeader eyebrow="Сервис" title="Команда" />

      <div className="space-y-4">
        {masters.map((m: Record<string, unknown>) => {
          const profile = m.masterProfile as {
            specialty: string | null;
            yearsExperience: number | null;
            bio: string | null;
            certifications: string[];
            isActive: boolean;
          } | null;
          const name = m.name as string;
          return (
            <div key={m.id as string} className="card flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-secondary)] flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-[var(--foreground-muted)]">
                  {name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium">{name}</p>
                {profile?.specialty && (
                  <p className="text-sm text-[var(--color-accent)]">{profile.specialty}</p>
                )}
                {profile?.bio ? (
                  <p className="text-sm text-[var(--foreground-muted)] mt-1">{profile.bio}</p>
                ) : null}
                {profile?.yearsExperience ? (
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Опыт: {profile.yearsExperience} лет
                  </p>
                ) : null}
                {profile?.certifications && profile.certifications.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {profile.certifications.map((cert: string) => (
                      <span key={cert} className="badge badge-silver text-[10px]">
                        {cert}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span
                className={`badge text-[10px] ${
                  profile?.isActive
                    ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                    : "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                }`}
              >
                {profile?.isActive ? "Активен" : "Неактивен"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
