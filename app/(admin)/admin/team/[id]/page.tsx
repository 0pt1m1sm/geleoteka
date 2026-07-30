export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { MasterProfileForm } from "@/components/admin/MasterProfileForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamMemberPage({ params }: Props): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;

  const user = (await db.user.findUnique({
    where: { id },
    include: { masterProfile: true },
  })) as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    permissionRole: string;
    deletedAt: Date | null;
    masterProfile: {
      specialty: string | null;
      bio: string | null;
      yearsExperience: number | null;
      certifications: string[];
      sortOrder: number;
      isActive: boolean;
    } | null;
  } | null;

  if (!user || user.deletedAt) notFound();

  const p = user.masterProfile;

  return (
    <div>
      <PageHeader
        eyebrow="Команда"
        title={user.name}
        description={user.email ?? user.phone ?? undefined}
        actions={
          <Link href="/admin/team" className="back-link">
            ← К команде
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <Card>
          <h2 className="text-lg font-semibold mb-4">Профиль на сайте</h2>
          <MasterProfileForm
            userId={user.id}
            initial={{
              specialty: p?.specialty ?? "",
              bio: p?.bio ?? "",
              yearsExperience: p?.yearsExperience?.toString() ?? "",
              certifications: (p?.certifications ?? []).join(", "),
              sortOrder: p?.sortOrder?.toString() ?? "0",
              isActive: p?.isActive ?? true,
            }}
          />
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-2">Учётная запись</h2>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">
            Имя, контакты и роль — это данные аккаунта, они редактируются в разделе «Доступы»,
            чтобы одно и то же значение не правилось в двух местах.
          </p>
          <Link href={`/admin/users/${user.id}`} className="btn btn-secondary text-sm">
            Открыть аккаунт →
          </Link>
        </Card>
      </div>
    </div>
  );
}
