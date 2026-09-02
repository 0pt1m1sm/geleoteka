export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { PageHeader } from "@/components/ui";
import { TeamMemberForm } from "@/components/admin/TeamMemberForm";

interface Props {
  params: Promise<{ id: string }>;
}

interface MemberRow {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  photoUrl: string | null;
  yearsExperience: number | null;
  certifications: string[];
  isActive: boolean;
  sortOrder: number;
}

export default async function EditTeamMemberPage({ params }: Props) {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const member = (await db.teamMember.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      role: true,
      bio: true,
      photoUrl: true,
      yearsExperience: true,
      certifications: true,
      isActive: true,
      sortOrder: true,
    },
  })) as MemberRow | null;

  if (!member) notFound();

  return (
    <div>
      <PageHeader eyebrow="Команда" title={member.name} />
      <TeamMemberForm initial={member} />
    </div>
  );
}
