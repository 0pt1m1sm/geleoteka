export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TeamMemberForm } from "@/components/admin/TeamMemberForm";

export default async function NewTeamMemberPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  return (
    <div>
      <PageHeader eyebrow="Команда" title="Новый сотрудник" />
      <TeamMemberForm />
    </div>
  );
}
