export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { CMSEditor } from "@/components/admin/CMSEditor";

export default async function CMSPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const blocks = await db.cMSBlock.findMany({
    orderBy: { key: "asc" },
  });

  const serialized = blocks.map((b: Record<string, unknown>) => ({
    id: b.id as string,
    key: b.key as string,
    content: b.content as Record<string, string>,
  }));

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">
        Управление контентом
      </h1>
      <CMSEditor blocks={serialized} />
    </div>
  );
}
