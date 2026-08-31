"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

interface DeleteVehicleResult {
  error: string | null;
  /** How much paperwork kept its content but lost the link to this car. */
  detached?: { repairOrders: number; deals: number };
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  return "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * Delete a customer's car.
 *
 * The car is a descriptive reference, not the owner of anything: repair orders
 * and deals carry their own work, money and photos, and merely point at it. So
 * deleting one is an ordinary edit — a duplicate entry, a sold car, a typo in
 * the VIN — and the paperwork keeps every line, its `vehicleId` simply becoming
 * NULL (see the 20260731140000 migration).
 *
 * Fleet cars are a different thing entirely: a rental booking IS a contract for
 * a specific car, so those are refused here and archived through the rentals
 * section instead.
 */
export async function deleteVehicle(vehicleId: string): Promise<DeleteVehicleResult> {
  const session = await getSession();
  if (!session) return { error: "Нужно войти" };

  const vehicle = (await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      ownerUserId: true,
      ownershipType: true,
      model: true,
      year: true,
      plate: true,
      _count: { select: { repairOrders: true, deals: true, rentalBookings: true } },
    },
  })) as {
    id: string;
    ownerUserId: string | null;
    ownershipType: string;
    model: string;
    year: number | null;
    plate: string | null;
    _count: { repairOrders: number; deals: number; rentalBookings: number };
  } | null;
  if (!vehicle) return { error: "Автомобиль не найден" };

  const isStaff = session.permissionRole === "ADMIN" || session.permissionRole === "MANAGER";
  if (!isStaff && vehicle.ownerUserId !== session.id) {
    return { error: "Это не ваш автомобиль" };
  }

  if (vehicle.ownershipType !== "CUSTOMER") {
    return {
      error: "Это автомобиль парка, а не клиента. Такие снимаются с эксплуатации в разделе аренды.",
    };
  }
  if (vehicle._count.rentalBookings > 0) {
    return { error: "По автомобилю есть брони аренды — сначала закройте их." };
  }

  // Named before it is gone — the log has to say WHICH car, and after the
  // delete there is nothing left to ask.
  const label = [vehicle.model, vehicle.year, vehicle.plate].filter(Boolean).join(", ");
  await db.vehicle.delete({ where: { id: vehicleId } });

  await recordAudit({
    actor: session,
    action: "vehicle.delete",
    targetType: "Vehicle",
    targetId: vehicleId,
    targetLabel: label,
    // Counts, because this is the number that makes the deletion reviewable:
    // paperwork kept, link dropped.
    metadata: {
      detachedRepairOrders: vehicle._count.repairOrders,
      detachedDeals: vehicle._count.deals,
    },
  });

  revalidatePath("/cabinet/cars");
  if (vehicle.ownerUserId) revalidatePath(`/admin/customers/${vehicle.ownerUserId}`);
  revalidatePath("/admin/repair-orders");
  return {
    error: null,
    detached: { repairOrders: vehicle._count.repairOrders, deals: vehicle._count.deals },
  };
}

export async function addCar(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  const session = await requireAuth();

  const model = formData.get("model") as string;
  const year = formData.get("year") as string;
  const vin = (formData.get("vin") as string)?.trim().toUpperCase() || null;
  const mileage = formData.get("mileage") as string;
  const color = (formData.get("color") as string)?.trim() || null;
  const plate = (formData.get("plate") as string)?.trim().toUpperCase() || null;

  if (!model || !year) {
    return { error: "Модель и год обязательны" };
  }

  const yearNum = parseInt(year);
  if (isNaN(yearNum) || yearNum < 1990 || yearNum > new Date().getFullYear() + 1) {
    return { error: "Некорректный год выпуска" };
  }

  if (vin && vin.length !== 17) {
    return { error: "VIN должен содержать 17 символов" };
  }

  if (vin) {
    const existing = await db.vehicle.findUnique({ where: { vin } });
    if (existing) {
      return { error: "Автомобиль с таким VIN уже зарегистрирован" };
    }
  }

  try {
    await db.vehicle.create({
      data: {
        ownershipType: "CUSTOMER",
        ownerUserId: session.id,
        model,
        year: yearNum,
        vin,
        mileage: mileage ? parseInt(mileage) : 0,
        color,
        plate,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Автомобиль с таким VIN уже зарегистрирован" };
    }
    throw err;
  }

  redirect("/cabinet/cars");
}
