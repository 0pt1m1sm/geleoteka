"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

interface CommResult {
  error: string | null;
  id?: string;
}

export async function logCommunication(
  _prev: CommResult | null,
  formData: FormData,
): Promise<CommResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const customerUserId = ((formData.get("customerUserId") as string | null) ?? "").trim();
  if (!customerUserId) return { error: "Не передан клиент" };

  const channel = ((formData.get("channel") as string | null) ?? "").trim();
  if (!channel) return { error: "Выберите канал" };

  const outcome = ((formData.get("outcome") as string | null) ?? "N_A").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim() || null;
  const dealIdRaw = ((formData.get("dealId") as string | null) ?? "").trim();
  const dealId = dealIdRaw || null;
  const durationRaw = ((formData.get("durationSec") as string | null) ?? "").trim();
  const durationSec = durationRaw ? Number.parseInt(durationRaw, 10) : null;

  const log = (await db.communicationLog.create({
    data: {
      customerUserId,
      authorUserId: session.id,
      dealId,
      channel: channel as never,
      outcome: outcome as never,
      body,
      durationSec: durationSec && !Number.isNaN(durationSec) ? durationSec : null,
    },
    select: { id: true },
  })) as { id: string };

  revalidatePath(`/admin/customers/${customerUserId}`);
  if (dealId) revalidatePath(`/admin/crm/deals/${dealId}`);
  return { error: null, id: log.id };
}

export async function deleteCommunication(id: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.communicationLog.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string; dealId: string | null } | null;
  if (!existing) return;
  await db.communicationLog.delete({ where: { id } });
  revalidatePath(`/admin/customers/${existing.customerUserId}`);
  if (existing.dealId) revalidatePath(`/admin/crm/deals/${existing.dealId}`);
}
