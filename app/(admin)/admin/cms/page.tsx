export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CMSGroupSection } from "@/components/admin/cms";
import { GROUP_ORDER } from "@/lib/cms-schema";
import { PageHeader } from "@/components/ui";

export default async function CMSPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const rows = (await db.cMSBlock.findMany({
    select: { key: true, type: true, content: true },
  })) as Array<{ key: string; type: string; content: unknown }>;

  const byKey = new Map<string, { type: string; content: Record<string, unknown> }>();
  for (const row of rows) {
    const c =
      typeof row.content === "object" && row.content !== null
        ? (row.content as Record<string, unknown>)
        : {};
    byKey.set(row.key, { type: row.type, content: c });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Сайт"
        title="Управление контентом"
        description="Редактируйте тексты публичной части сайта. Изменения применяются сразу после сохранения."
      />
      <div className="flex flex-col gap-4">
        {GROUP_ORDER.map((group) => (
          <CMSGroupSection key={group} group={group} values={{ byKey }} />
        ))}
      </div>
    </div>
  );
}
