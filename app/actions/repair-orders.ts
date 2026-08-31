"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDeal, nextRepairOrderNumber } from "@/lib/crm/public";
import { parseDatetimeLocalInput } from "@/lib/timezone";
import {
  isServiceBayAllocationConflict,
  reserveServiceBaySlot,
  SERVICE_BAY_CONFLICT_MESSAGE,
  type ServiceBayAllocationTx,
} from "@/lib/scheduling/service-bays";

interface Result {
  error: string | null;
}

/**
 * Завести заказ-наряд руками.
 *
 * До этого он рождался только двумя путями: онлайн-бронирование и согласование
 * сметы по сделке, где его создаёт dispatchFulfillment. Клиент, приехавший без
 * записи, вынуждал менеджера завести сделку, выдумать смету и согласовать её —
 * только чтобы получить наряд.
 *
 * `RepairOrder.dealId` обязателен и каскадит от сделки: наряда без сделки быть
 * не может. Поэтому либо цепляем существующую, либо заводим новую.
 *
 * Сделка создаётся ПЕРВОЙ и отдельно: `createDeal` открывает собственную
 * транзакцию, вложить её нельзя. Поэтому всё, что можно проверить, проверяется
 * до неё — иначе отказ на втором шаге оставил бы пустую сделку сиротой.
 */
export async function createRepairOrderManually(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const customerUserId = ((formData.get("customerUserId") as string | null) ?? "").trim();
  const vehicleIdRaw = ((formData.get("vehicleId") as string | null) ?? "").trim();
  const dealIdRaw = ((formData.get("dealId") as string | null) ?? "").trim();
  const dateTimeRaw = ((formData.get("dateTime") as string | null) ?? "").trim();
  const concern = ((formData.get("concern") as string | null) ?? "").trim() || null;

  if (!customerUserId) return { error: "Выберите клиента" };
  if (!dateTimeRaw) return { error: "Укажите дату и время" };
  const dateTime = parseDatetimeLocalInput(dateTimeRaw);
  if (!dateTime) return { error: "Некорректные дата и время" };

  const customer = (await db.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, name: true },
  })) as { id: string; name: string } | null;
  if (!customer) return { error: "Клиент не найден" };

  let vehicleId: string | null = null;
  if (vehicleIdRaw) {
    const vehicle = (await db.vehicle.findUnique({
      where: { id: vehicleIdRaw },
      select: { id: true, ownerUserId: true },
    })) as { id: string; ownerUserId: string | null } | null;
    if (!vehicle) return { error: "Автомобиль не найден" };
    if (vehicle.ownerUserId && vehicle.ownerUserId !== customerUserId) {
      return { error: "Этот автомобиль принадлежит другому клиенту" };
    }
    vehicleId = vehicle.id;
  }

  let dealId = dealIdRaw || null;
  if (dealId) {
    const deal = (await db.deal.findUnique({
      where: { id: dealId },
      select: { id: true, customerUserId: true },
    })) as { id: string; customerUserId: string | null } | null;
    if (!deal) return { error: "Сделка не найдена" };
    if (deal.customerUserId !== customerUserId) {
      return { error: "Эта сделка принадлежит другому клиенту" };
    }
  } else {
    const created = await createDeal({
      customerUserId,
      vehicleId,
      ownerUserId: session.id,
      channel: "SERVICE" as never,
      source: "manual",
      initialStage: "NEW",
      notes: concern,
    });
    dealId = created.id;
  }

  let ro: { id: string; roNumber: string | null };
  try {
    ro = await db.$transaction(async (tx) => {
      const roNumber = await nextRepairOrderNumber(tx);
      const created = (await tx.repairOrder.create({
        data: { roNumber, dealId: dealId as string, userId: customerUserId, vehicleId, dateTime, concern },
        select: { id: true, roNumber: true },
      })) as { id: string; roNumber: string | null };
      try {
        await reserveServiceBaySlot(tx as unknown as ServiceBayAllocationTx, {
          repairOrderId: created.id,
          dateTime,
        });
      } catch (error) {
        // ПРОШЕДШИЙ визит записываем даже без свободного поста.
        //
        // Распределение постов существует, чтобы не занять одну и ту же
        // мощность дважды В БУДУЩЕМ. Визит, который уже состоялся, — это факт,
        // а не бронь: машина приезжала независимо от того, что показывает
        // расписание задним числом. Менеджер, заносящий вручную клиента,
        // который просто пришёл, упирался здесь в отказ «нет свободного поста»
        // из-за конфликта, которого давно нет, и записать историю не мог.
        //
        // Для БУДУЩЕЙ записи поведение прежнее: конфликт — это отказ, иначе мы
        // пообещали бы клиенту время, которого нет.
        if (!(isServiceBayAllocationConflict(error) && dateTime.getTime() < Date.now())) {
          throw error;
        }
      }
      return created;
    });
  } catch (error) {
    if (isServiceBayAllocationConflict(error)) {
      return { error: SERVICE_BAY_CONFLICT_MESSAGE };
    }
    throw error;
  }

  await recordAudit({
    actor: session,
    action: "repairOrder.create",
    targetType: "RepairOrder",
    targetId: ro.id,
    targetLabel: ro.roNumber ?? ro.id,
    metadata: { customer: customer.name, dealId, hasVehicle: vehicleId !== null },
  });

  revalidatePath("/admin/repair-orders");
  revalidatePath(`/admin/crm/deals/${dealId}`);
  redirect(`/admin/repair-orders/${ro.id}`);
}
