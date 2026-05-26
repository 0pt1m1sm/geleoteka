"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";
import { consumeApprovedEstimateParts } from "@/lib/fulfillment/consume-parts";
import { actorId } from "@/lib/wms-host";
import { parseDatetimeLocalInput } from "@/lib/timezone";

export async function updateRepairOrderStatus(
  repairOrderId: string,
  newStatus: string
): Promise<void> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "COMPLETED") {
    updateData.completedAt = new Date();
  }

  // Detect the entry into COMPLETED so parts are consumed exactly once
  // (recordMovement's idempotency key also guards a re-fire).
  const prior = (await db.repairOrder.findUnique({
    where: { id: repairOrderId },
    select: { status: true, dealId: true },
  })) as { status: string; dealId: string } | null;
  const enteringCompleted =
    newStatus === "COMPLETED" && prior !== null && prior.status !== "COMPLETED";

  await db.$transaction(async (tx) => {
    await tx.repairOrder.update({ where: { id: repairOrderId }, data: updateData });
    if (enteringCompleted && prior) {
      await consumeApprovedEstimateParts(tx, {
        dealId: prior.dealId,
        sourceType: "RepairOrder",
        sourceId: repairOrderId,
        actorId: actorId(session),
      });
    }
  });

  // Cancelled ROs release their slot so the time becomes bookable again.
  // Hard-delete keeps the slot row consistent with there being no active RO.
  if (newStatus === "CANCELLED") {
    await db.slot.deleteMany({ where: { repairOrderId } });
  }

  const repairOrder = await db.repairOrder.findUnique({
    where: { id: repairOrderId },
    include: { user: { select: { id: true, phone: true } } },
  });

  if (repairOrder) {
    const user = (repairOrder as Record<string, unknown>).user as { id: string; phone: string };
    const label = REPAIR_ORDER_STATUS_LABELS[newStatus] ?? newStatus;

    await db.notification.create({
      data: {
        userId: user.id,
        type: "STATUS_CHANGE",
        message: `Статус вашего заказ-наряда изменён: ${label}`,
        metadata: { repairOrderId },
      },
    });

    const { sendStatusChange } = await import("@/lib/sms");
    await sendStatusChange(user.phone, label);
  }
}

export async function deleteRepairOrder(repairOrderId: string): Promise<void> {
  await requireRole(["ADMIN"]);

  await db.repairOrder.delete({
    where: { id: repairOrderId },
  });
}

interface JobLineInput {
  description: string;
  laborHours: number;
  laborRate: number;
  partDescription?: string;
  partQty?: number;
  partUnitPrice?: number;
}

export async function addJobLines(
  _prevState: { error: string | null; success?: boolean } | null,
  formData: FormData
): Promise<{ error: string | null; success?: boolean }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const repairOrderId = formData.get("repairOrderId") as string;
  if (!repairOrderId) return { error: "Выберите заказ-наряд" };

  const descriptions = formData.getAll("description") as string[];
  const laborHoursList = formData.getAll("laborHours") as string[];
  const laborRates = formData.getAll("laborRate") as string[];
  const partDescriptions = formData.getAll("partDescription") as string[];
  const partQtys = formData.getAll("partQty") as string[];
  const partUnitPrices = formData.getAll("partUnitPrice") as string[];

  if (descriptions.length === 0 || descriptions.every((d) => !d.trim())) {
    return { error: "Добавьте хотя бы одну работу" };
  }

  const jobs: JobLineInput[] = descriptions
    .map((desc, i) => ({
      description: desc.trim(),
      laborHours: parseFloat(laborHoursList[i]) || 0,
      laborRate: parseInt(laborRates[i]) || 0,
      partDescription: partDescriptions[i]?.trim() || undefined,
      partQty: parseInt(partQtys[i]) || undefined,
      partUnitPrice: parseInt(partUnitPrices[i]) || undefined,
    }))
    .filter((j) => j.description);

  if (jobs.length === 0) return { error: "Нет валидных работ" };

  // Find current max sortOrder so new jobs append
  const existing = await db.jobLine.findMany({
    where: { repairOrderId },
    orderBy: { sortOrder: "desc" },
    take: 1,
    select: { sortOrder: true },
  });
  const startSort = existing.length > 0 ? (existing[0] as { sortOrder: number }).sortOrder + 1 : 0;

  for (const [idx, job] of jobs.entries()) {
    const laborTotal = Math.round(job.laborHours * job.laborRate);
    const partTotal = job.partDescription && job.partUnitPrice && job.partQty
      ? job.partUnitPrice * job.partQty
      : 0;
    const jobTotal = laborTotal + partTotal;

    await db.jobLine.create({
      data: {
        repairOrderId,
        sortOrder: startSort + idx,
        description: job.description,
        status: "PROPOSED",
        laborTotal,
        partsTotal: partTotal,
        total: jobTotal,
        laborLines: job.laborRate > 0 || job.laborHours > 0 ? {
          create: [{
            description: job.description,
            bookHours: job.laborHours,
            rate: job.laborRate,
            total: laborTotal,
          }],
        } : undefined,
        partLines: job.partDescription ? {
          create: [{
            description: job.partDescription,
            qty: job.partQty || 1,
            unitCost: 0,
            unitPrice: job.partUnitPrice || 0,
          }],
        } : undefined,
      },
    });
  }

  // Recompute RO totals from all job lines
  const allJobs = await db.jobLine.findMany({
    where: { repairOrderId },
    select: { laborTotal: true, partsTotal: true, total: true },
  });
  const subtotalLabor = allJobs.reduce((s: number, j: { laborTotal: number }) => s + j.laborTotal, 0);
  const subtotalParts = allJobs.reduce((s: number, j: { partsTotal: number }) => s + j.partsTotal, 0);
  const total = allJobs.reduce((s: number, j: { total: number }) => s + j.total, 0);

  await db.repairOrder.update({
    where: { id: repairOrderId },
    data: { subtotalLabor, subtotalParts, total },
  });

  // Notify client
  const repairOrder = await db.repairOrder.findUnique({
    where: { id: repairOrderId },
    select: { userId: true },
  });

  if (repairOrder) {
    const ro = repairOrder as { userId: string };
    await db.notification.create({
      data: {
        userId: ro.userId,
        type: "ESTIMATE_READY",
        message: "Смета готова к согласованию. Откройте личный кабинет для просмотра.",
        metadata: { repairOrderId },
      },
    });
  }

  redirect(`/admin/repair-orders/${repairOrderId}`);
}

interface UpdateRepairOrderDetailsResult {
  error: string | null;
  success?: boolean;
}

export async function updateRepairOrderDetails(
  _prevState: UpdateRepairOrderDetailsResult | null,
  formData: FormData,
): Promise<UpdateRepairOrderDetailsResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const repairOrderId = formData.get("repairOrderId") as string;
  if (!repairOrderId) return { error: "Не передан заказ-наряд" };

  const concernRaw = formData.get("concern");
  const notesRaw = formData.get("notes");
  const mileageInRaw = formData.get("mileageIn");
  const mileageOutRaw = formData.get("mileageOut");
  const promisedAtRaw = formData.get("promisedAt");
  const masterUserIdRaw = formData.get("masterUserId");

  const data: Record<string, unknown> = {};
  if (typeof concernRaw === "string") {
    data.concern = concernRaw.trim() || null;
  }
  if (typeof notesRaw === "string") {
    data.notes = notesRaw.trim() || null;
  }
  if (typeof mileageInRaw === "string") {
    data.mileageIn = mileageInRaw.trim() === "" ? null : Number.parseInt(mileageInRaw, 10);
    if (data.mileageIn !== null && Number.isNaN(data.mileageIn)) {
      return { error: "Пробег при приёмке должен быть числом" };
    }
  }
  if (typeof mileageOutRaw === "string") {
    data.mileageOut = mileageOutRaw.trim() === "" ? null : Number.parseInt(mileageOutRaw, 10);
    if (data.mileageOut !== null && Number.isNaN(data.mileageOut)) {
      return { error: "Пробег при выдаче должен быть числом" };
    }
  }
  if (typeof promisedAtRaw === "string") {
    if (promisedAtRaw.trim() === "") {
      data.promisedAt = null;
    } else {
      // datetime-local has no TZ; interpret it as BUSINESS_TZ wall-clock (the
      // shop's local time) → UTC, matching how the value is rendered back.
      const d = parseDatetimeLocalInput(promisedAtRaw);
      if (!d) return { error: "Некорректная дата готовности" };
      data.promisedAt = d;
    }
  }
  if (typeof masterUserIdRaw === "string") {
    data.masterUserId = masterUserIdRaw.trim() === "" ? null : masterUserIdRaw;
  }

  await db.repairOrder.update({ where: { id: repairOrderId }, data });
  revalidatePath(`/admin/repair-orders/${repairOrderId}`);
  return { error: null, success: true };
}

// Single job-line CRUD (addJobLine/updateJobLine/deleteJobLine) + its helpers
// were removed as dead code — superseded by the batch addJobLines flow used by
// EstimateBuilder. See git history if the singular-edit path is ever needed.
