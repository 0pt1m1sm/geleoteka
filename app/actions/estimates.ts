"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

type JobLineDecision = "APPROVED" | "DECLINED" | "DEFERRED";

// Customer can only respond while the RO is still gathering approvals.
// Once work starts (IN_PROGRESS) or the RO is finalised, decisions are locked.
const RO_STATES_OPEN_FOR_DECISION = ["ESTIMATE", "APPROVED"] as const;

export async function respondToJobLine(
  jobLineId: string,
  decision: JobLineDecision
): Promise<void> {
  const session = await requireAuth();

  await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    const jobLine = await tx.jobLine.findUnique({
      where: { id: jobLineId },
      include: { repairOrder: { select: { id: true, userId: true, status: true } } },
    });
    if (!jobLine) return;

    const ro = (jobLine as Record<string, unknown>).repairOrder as {
      id: string;
      userId: string;
      status: string;
    };

    if (ro.userId !== session.id) return;
    if (!RO_STATES_OPEN_FOR_DECISION.includes(ro.status as (typeof RO_STATES_OPEN_FOR_DECISION)[number])) return;

    // Atomic transition: only flip jobs that are still PROPOSED.
    // Prevents customers from un-approving work that has already started.
    const updated = await tx.jobLine.updateMany({
      where: { id: jobLineId, status: "PROPOSED" },
      data: { status: decision },
    });
    if (updated.count === 0) return;

    const approvedJobs = await tx.jobLine.findMany({
      where: { repairOrderId: ro.id, status: "APPROVED" },
      select: { laborTotal: true, partsTotal: true, total: true },
    });

    const subtotalLabor = approvedJobs.reduce(
      (s: number, j: { laborTotal: number }) => s + j.laborTotal,
      0
    );
    const subtotalParts = approvedJobs.reduce(
      (s: number, j: { partsTotal: number }) => s + j.partsTotal,
      0
    );
    const total = approvedJobs.reduce(
      (s: number, j: { total: number }) => s + j.total,
      0
    );

    await tx.repairOrder.update({
      where: { id: ro.id },
      data: { subtotalLabor, subtotalParts, total },
    });
  });
}
