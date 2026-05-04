"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

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

  redirect("/cabinet/cars");
}
