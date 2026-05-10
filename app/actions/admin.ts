"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";

async function recomputeRepairOrderTotals(repairOrderId: string): Promise<void> {
  const allJobs = await db.jobLine.findMany({
    where: { repairOrderId },
    select: { laborTotal: true, partsTotal: true, total: true },
  });
  const subtotalLabor = allJobs.reduce(
    (s: number, j: { laborTotal: number }) => s + j.laborTotal,
    0,
  );
  const subtotalParts = allJobs.reduce(
    (s: number, j: { partsTotal: number }) => s + j.partsTotal,
    0,
  );
  const total = allJobs.reduce(
    (s: number, j: { total: number }) => s + j.total,
    0,
  );
  await db.repairOrder.update({
    where: { id: repairOrderId },
    data: { subtotalLabor, subtotalParts, total },
  });
}

export async function updateRepairOrderStatus(
  repairOrderId: string,
  newStatus: string
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "PAID" || newStatus === "CLOSED") {
    updateData.completedAt = new Date();
  }

  await db.repairOrder.update({
    where: { id: repairOrderId },
    data: updateData,
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
  partUnitCost?: number;
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
  const partUnitCosts = formData.getAll("partUnitCost") as string[];
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
      partUnitCost: parseInt(partUnitCosts[i]) || undefined,
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
            unitCost: job.partUnitCost || 0,
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
      const d = new Date(promisedAtRaw);
      if (Number.isNaN(d.getTime())) return { error: "Некорректная дата готовности" };
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

interface JobLineMutationResult {
  error: string | null;
  success?: boolean;
}

interface JobLineFormInput {
  description: string;
  laborHours: number;
  laborRate: number;
  partDescription: string | null;
  partQty: number | null;
  partUnitCost: number | null;
  partUnitPrice: number | null;
  status: string;
}

function readJobLineFields(formData: FormData): JobLineFormInput {
  const description = ((formData.get("description") as string | null) ?? "").trim();
  const laborHours = Number.parseFloat((formData.get("laborHours") as string) ?? "") || 0;
  const laborRate = Number.parseInt((formData.get("laborRate") as string) ?? "", 10) || 0;
  const partDescriptionRaw = ((formData.get("partDescription") as string | null) ?? "").trim();
  const partDescription = partDescriptionRaw || null;
  const partQty = partDescription
    ? Number.parseInt((formData.get("partQty") as string) ?? "1", 10) || 1
    : null;
  const partUnitCost = partDescription
    ? Number.parseInt((formData.get("partUnitCost") as string) ?? "0", 10) || 0
    : null;
  const partUnitPrice = partDescription
    ? Number.parseInt((formData.get("partUnitPrice") as string) ?? "0", 10) || 0
    : null;
  const status = ((formData.get("status") as string | null) ?? "PROPOSED").trim() || "PROPOSED";
  return {
    description,
    laborHours,
    laborRate,
    partDescription,
    partQty,
    partUnitCost,
    partUnitPrice,
    status,
  };
}

function computeJobLineTotals(input: JobLineFormInput): {
  laborTotal: number;
  partsTotal: number;
  total: number;
} {
  const laborTotal = Math.round(input.laborHours * input.laborRate);
  const partsTotal =
    input.partDescription && input.partUnitPrice && input.partQty
      ? input.partUnitPrice * input.partQty
      : 0;
  return { laborTotal, partsTotal, total: laborTotal + partsTotal };
}

export async function addJobLine(
  _prevState: JobLineMutationResult | null,
  formData: FormData,
): Promise<JobLineMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const repairOrderId = formData.get("repairOrderId") as string;
  if (!repairOrderId) return { error: "Не передан заказ-наряд" };
  const input = readJobLineFields(formData);
  if (!input.description) return { error: "Введите описание работы" };

  const totals = computeJobLineTotals(input);
  const last = await db.jobLine.findFirst({
    where: { repairOrderId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = last ? (last as { sortOrder: number }).sortOrder + 1 : 0;

  await db.jobLine.create({
    data: {
      repairOrderId,
      sortOrder,
      description: input.description,
      status: input.status as never,
      laborTotal: totals.laborTotal,
      partsTotal: totals.partsTotal,
      total: totals.total,
      laborLines:
        input.laborHours > 0 || input.laborRate > 0
          ? {
              create: [{
                description: input.description,
                bookHours: input.laborHours,
                rate: input.laborRate,
                total: totals.laborTotal,
              }],
            }
          : undefined,
      partLines:
        input.partDescription
          ? {
              create: [{
                description: input.partDescription,
                qty: input.partQty ?? 1,
                unitCost: input.partUnitCost ?? 0,
                unitPrice: input.partUnitPrice ?? 0,
              }],
            }
          : undefined,
    },
  });

  await recomputeRepairOrderTotals(repairOrderId);
  revalidatePath(`/admin/repair-orders/${repairOrderId}`);
  return { error: null, success: true };
}

export async function updateJobLine(
  _prevState: JobLineMutationResult | null,
  formData: FormData,
): Promise<JobLineMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const jobLineId = formData.get("jobLineId") as string;
  if (!jobLineId) return { error: "Не передан jobLineId" };

  const existing = await db.jobLine.findUnique({
    where: { id: jobLineId },
    select: { repairOrderId: true },
  });
  if (!existing) return { error: "Работа не найдена" };
  const { repairOrderId } = existing as { repairOrderId: string };

  const input = readJobLineFields(formData);
  if (!input.description) return { error: "Введите описание работы" };
  const totals = computeJobLineTotals(input);

  // Replace labor + part children — single canonical row each. Keeps the
  // edit form 1:1 with EstimateBuilder while staying simple. Sub-row IDs
  // aren't surfaced anywhere yet, so churn here is harmless.
  await db.laborLine.deleteMany({ where: { jobLineId } });
  await db.partLine.deleteMany({ where: { jobLineId } });

  await db.jobLine.update({
    where: { id: jobLineId },
    data: {
      description: input.description,
      status: input.status as never,
      laborTotal: totals.laborTotal,
      partsTotal: totals.partsTotal,
      total: totals.total,
      laborLines:
        input.laborHours > 0 || input.laborRate > 0
          ? {
              create: [{
                description: input.description,
                bookHours: input.laborHours,
                rate: input.laborRate,
                total: totals.laborTotal,
              }],
            }
          : undefined,
      partLines:
        input.partDescription
          ? {
              create: [{
                description: input.partDescription,
                qty: input.partQty ?? 1,
                unitCost: input.partUnitCost ?? 0,
                unitPrice: input.partUnitPrice ?? 0,
              }],
            }
          : undefined,
    },
  });

  await recomputeRepairOrderTotals(repairOrderId);
  revalidatePath(`/admin/repair-orders/${repairOrderId}`);
  return { error: null, success: true };
}

export async function deleteJobLine(jobLineId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);

  const existing = await db.jobLine.findUnique({
    where: { id: jobLineId },
    select: { repairOrderId: true },
  });
  if (!existing) return;
  const { repairOrderId } = existing as { repairOrderId: string };

  await db.jobLine.delete({ where: { id: jobLineId } });
  await recomputeRepairOrderTotals(repairOrderId);
  revalidatePath(`/admin/repair-orders/${repairOrderId}`);
}
