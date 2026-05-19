"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

interface TaskResult {
  error: string | null;
  id?: string;
}

function revalidateTaskPaths(opts: {
  customerUserId?: string | null;
  dealId?: string | null;
}): void {
  // /admin/crm/tasks and /admin/crm are force-dynamic (no RSC payload cache to
  // evict). Skipping them — the client's router.refresh() after the action
  // already re-renders whatever the manager is currently viewing.
  if (opts.customerUserId) revalidatePath(`/admin/customers/${opts.customerUserId}`);
  if (opts.dealId) revalidatePath(`/admin/crm/deals/${opts.dealId}`);
}

export async function createCrmTask(
  _prev: TaskResult | null,
  formData: FormData,
): Promise<TaskResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const title = ((formData.get("title") as string | null) ?? "").trim();
  if (!title) return { error: "Укажите заголовок" };

  const dueAtRaw = ((formData.get("dueAt") as string | null) ?? "").trim();
  if (!dueAtRaw) return { error: "Укажите срок" };
  const dueAt = new Date(dueAtRaw);
  if (Number.isNaN(dueAt.getTime())) return { error: "Некорректная дата" };

  const ownerUserIdRaw = ((formData.get("ownerUserId") as string | null) ?? "").trim();
  const ownerUserId = ownerUserIdRaw || session.id;

  const kind = ((formData.get("kind") as string | null) ?? "GENERIC").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim() || null;
  const customerUserId =
    ((formData.get("customerUserId") as string | null) ?? "").trim() || null;
  const dealId = ((formData.get("dealId") as string | null) ?? "").trim() || null;

  const task = (await db.crmTask.create({
    data: {
      title,
      body,
      kind: kind as never,
      dueAt,
      ownerUserId,
      customerUserId,
      dealId,
    },
    select: { id: true },
  })) as { id: string };

  revalidateTaskPaths({ customerUserId, dealId });
  return { error: null, id: task.id };
}

export async function completeCrmTask(id: string): Promise<TaskResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  await db.crmTask.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date() },
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function reopenCrmTask(id: string): Promise<TaskResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  await db.crmTask.update({
    where: { id },
    data: { status: "OPEN", completedAt: null },
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function cancelCrmTask(id: string): Promise<TaskResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  await db.crmTask.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  revalidateTaskPaths(existing);
  return { error: null, id };
}

export async function rescheduleCrmTask(
  id: string,
  dueAtIso: string,
): Promise<TaskResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime())) return { error: "Некорректная дата" };

  const existing = (await db.crmTask.findUnique({
    where: { id },
    select: { customerUserId: true, dealId: true },
  })) as { customerUserId: string | null; dealId: string | null } | null;
  if (!existing) return { error: "Задача не найдена" };

  await db.crmTask.update({ where: { id }, data: { dueAt } });
  revalidateTaskPaths(existing);
  return { error: null, id };
}
