export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { Markdown } from "@/components/shared/Markdown";
import { getCMSText, getCMSRichtext, getCMSList } from "@/lib/cms";

interface MasterData {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  experience: number | null;
  certifications: string[];
}

export default async function AboutPage(): Promise<React.ReactElement> {
  const [users, eyebrow, title, description, historyTitle, historyItems, teamTitle, certTitle, certBody] =
    await Promise.all([
      db.user.findMany({
        where: { isMaster: true, masterProfile: { isActive: true } },
        include: { masterProfile: true },
      }),
      getCMSText("about.eyebrow"),
      getCMSText("about.title"),
      getCMSText("about.description"),
      getCMSText("about.history.title"),
      getCMSList("about.history.items"),
      getCMSText("about.team.title"),
      getCMSText("about.certificates.title"),
      getCMSRichtext("about.certificates.body"),
    ]);

  const masters: MasterData[] = users
    .map((u: Record<string, unknown>) => {
      const profile = u.masterProfile as {
        specialty: string | null;
        bio: string | null;
        yearsExperience: number | null;
        certifications: string[];
        sortOrder: number;
      } | null;
      return {
        id: u.id as string,
        name: u.name as string,
        role: profile?.specialty ?? "",
        bio: profile?.bio ?? null,
        experience: profile?.yearsExperience ?? null,
        certifications: profile?.certifications ?? [],
        sortOrder: profile?.sortOrder ?? 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        align="center"
        className="mb-16"
      />

      {/* Timeline */}
      <div className="max-w-3xl mx-auto mb-20">
        <h2 className="text-display text-2xl font-bold mb-8 text-center">{historyTitle}</h2>
        <div className="space-y-8">
          {historyItems.map((item, i) => (
            <div key={i} className="flex gap-6">
              <div className="text-display text-2xl font-bold text-[var(--color-accent)] w-16 shrink-0 text-right">
                {item.year}
              </div>
              <div className="border-l-2 border-[var(--border)] pl-6 pb-2">
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <div className="text-sm text-[var(--foreground-muted)]">
                  <Markdown source={item.text ?? ""} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div className="mb-16">
        <h2 className="text-display text-2xl font-bold mb-8 text-center">{teamTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {masters.map((master) => (
            <div key={master.id} className="card text-center">
              <div className="w-20 h-20 rounded-full bg-[var(--color-secondary)] mx-auto mb-4 flex items-center justify-center">
                <span className="text-2xl font-bold text-[var(--foreground-muted)]">
                  {master.name.split(" ").map((n) => n[0]).join("")}
                </span>
              </div>
              <h3 className="font-semibold">{master.name}</h3>
              <p className="text-sm text-[var(--color-accent)] mb-2">{master.role}</p>
              {master.experience && (
                <p className="text-xs text-[var(--foreground-muted)] mb-3">
                  Опыт: {master.experience} лет
                </p>
              )}
              {master.bio && (
                <p className="text-xs text-[var(--foreground-muted)] mb-3 line-clamp-3">{master.bio}</p>
              )}
              {master.certifications.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {master.certifications.map((cert: string) => (
                    <span key={cert} className="badge badge-silver text-[10px]">
                      {cert}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Certificates */}
      <div className="text-center">
        <h2 className="text-display text-2xl font-bold mb-4">{certTitle}</h2>
        <div className="text-[var(--foreground-muted)] max-w-xl mx-auto">
          <Markdown source={certBody} />
        </div>
      </div>
    </div>
  );
}
