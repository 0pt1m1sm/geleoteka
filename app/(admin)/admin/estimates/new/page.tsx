export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { EstimateBuilder } from "@/components/admin/EstimateBuilder";

export default async function NewEstimatePage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const appointments = await db.appointment.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      estimate: null,
    },
    include: {
      user: { select: { name: true } },
      car: { select: { model: true } },
    },
    orderBy: { dateTime: "desc" },
  });

  const options = appointments.map((a: Record<string, unknown>) => ({
    id: a.id as string,
    label: `${(a.user as Record<string, string>).name} — ${(a.car as Record<string, string>).model}`,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Создать смету</h1>
      <EstimateBuilder appointments={options} />
    </div>
  );
}
