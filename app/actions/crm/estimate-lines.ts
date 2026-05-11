"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeEstimateTotals } from "@/lib/crm/internal/recompute-estimate-totals";
import { signedLineTotal } from "@/lib/crm/internal/signed-line-total";

interface EstimateLineMutationResult {
  error: string | null;
  success?: boolean;
}

/**
 * Server-side guard: only DRAFT estimates can be edited line-by-line.
 * Once SENT (or any terminal stage) the snapshot is frozen.
 *
 * The client never carries enough authority to bypass — every update/
 * delete derives the parent estimateId from the line row, not from the
 * form payload, before calling this gate.
 */
async function assertDraft(
  estimateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { stage: true },
  })) as { stage: string } | null;
  if (!est) return { ok: false, error: "Смета не найдена" };
  if (est.stage !== "DRAFT") {
    return { ok: false, error: "Эту смету уже нельзя редактировать" };
  }
  return { ok: true };
}

export async function addEstimateLine(
  _prevState: EstimateLineMutationResult | null,
  formData: FormData,
): Promise<EstimateLineMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const estimateId = formData.get("estimateId") as string;
  if (!estimateId) return { error: "Не передан estimateId" };

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) return { error: "Введите описание" };

  const gate = await assertDraft(estimateId);
  if (!gate.ok) return { error: gate.error };

  const type = ((formData.get("type") as string | null) ?? "LABOR").trim();
  const qty = Number.parseFloat((formData.get("qty") as string) ?? "1") || 1;
  const rawUnitPrice =
    Number.parseInt((formData.get("unitPrice") as string) ?? "0", 10) || 0;
  const partId = ((formData.get("partId") as string | null) ?? "").trim() || null;

  const { unitPrice, total } = signedLineTotal(type, qty, rawUnitPrice);

  const last = (await db.estimateLine.findFirst({
    where: { estimateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })) as { sortOrder: number } | null;
  const sortOrder = last ? last.sortOrder + 1 : 0;

  await db.estimateLine.create({
    data: {
      estimateId,
      sortOrder,
      type: type as never,
      description,
      qty,
      unitPrice,
      total,
      partId,
    },
  });

  await recomputeEstimateTotals(estimateId);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  return { error: null, success: true };
}

export async function updateEstimateLine(
  _prevState: EstimateLineMutationResult | null,
  formData: FormData,
): Promise<EstimateLineMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const id = formData.get("estimateLineId") as string;
  if (!id) return { error: "Не передан estimateLineId" };

  const existing = (await db.estimateLine.findUnique({
    where: { id },
    select: { estimateId: true },
  })) as { estimateId: string } | null;
  if (!existing) return { error: "Строка не найдена" };

  const gate = await assertDraft(existing.estimateId);
  if (!gate.ok) return { error: gate.error };

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) return { error: "Введите описание" };
  const type = ((formData.get("type") as string | null) ?? "LABOR").trim();
  const qty = Number.parseFloat((formData.get("qty") as string) ?? "1") || 1;
  const rawUnitPrice =
    Number.parseInt((formData.get("unitPrice") as string) ?? "0", 10) || 0;
  const { unitPrice, total } = signedLineTotal(type, qty, rawUnitPrice);

  await db.estimateLine.update({
    where: { id },
    data: {
      description,
      type: type as never,
      qty,
      unitPrice,
      total,
    },
  });

  await recomputeEstimateTotals(existing.estimateId);
  revalidatePath(`/admin/crm/estimates/${existing.estimateId}`);
  return { error: null, success: true };
}

export async function deleteEstimateLine(
  estimateLineId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const existing = (await db.estimateLine.findUnique({
    where: { id: estimateLineId },
    select: { estimateId: true },
  })) as { estimateId: string } | null;
  if (!existing) return { error: "Строка не найдена" };

  const gate = await assertDraft(existing.estimateId);
  if (!gate.ok) return { error: gate.error };

  await db.estimateLine.delete({ where: { id: estimateLineId } });
  await recomputeEstimateTotals(existing.estimateId);
  revalidatePath(`/admin/crm/estimates/${existing.estimateId}`);
  return { error: null };
}
