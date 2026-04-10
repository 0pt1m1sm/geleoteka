"use server";

import { redirect } from "next/navigation";
import { requireRole, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/utils";

export async function createRentalCar(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const model = (formData.get("model") as string)?.trim();
  const year = parseInt(formData.get("year") as string);
  const dailyRate = parseInt(formData.get("dailyRate") as string);
  const description = (formData.get("description") as string)?.trim() || null;
  const color = (formData.get("color") as string)?.trim() || null;
  const plate = (formData.get("plate") as string)?.trim().toUpperCase() || null;
  const mileage = parseInt(formData.get("mileage") as string) || 0;

  if (!model || isNaN(year) || isNaN(dailyRate)) {
    return { error: "Модель, год и стоимость обязательны" };
  }

  await db.rentalCar.create({
    data: { model, year, dailyRate, description, color, plate, mileage, photos: [] },
  });

  redirect("/admin/rentals");
}

export async function updateRentalBookingStatus(
  bookingId: string,
  status: string
): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  await db.rentalBooking.update({
    where: { id: bookingId },
    data: { status: status as "PENDING" | "CONFIRMED" | "ACTIVE" | "RETURNED" | "CANCELLED" },
  });
}

interface RentalBookingInput {
  carId: string;
  startDate: string;
  endDate: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
}

interface RentalBookingResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

export async function createRentalBooking(input: RentalBookingInput): Promise<RentalBookingResult> {
  const { carId, startDate, endDate, contactName, contactPhone, contactEmail, notes } = input;

  if (!carId || !startDate || !endDate || !contactName || !contactPhone || !contactEmail) {
    return { success: false, error: "Заполните все обязательные поля" };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: "Некорректные даты" };
  }

  if (end <= start) {
    return { success: false, error: "Дата окончания должна быть позже начала" };
  }

  if (start <= new Date()) {
    return { success: false, error: "Дата начала должна быть в будущем" };
  }

  try {
    const car: { dailyRate: number } | null = await db.rentalCar.findUnique({
      where: { id: carId },
      select: { dailyRate: true },
    });
    if (!car) return { success: false, error: "Автомобиль не найден" };

    // Check availability — no overlapping bookings
    const overlap = await db.rentalBooking.findFirst({
      where: {
        carId,
        status: { notIn: ["CANCELLED", "RETURNED"] },
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    });

    if (overlap) {
      return { success: false, error: "Автомобиль занят на выбранные даты" };
    }

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const totalCost = days * car.dailyRate;

    const session = await getSession();

    const booking = await db.rentalBooking.create({
      data: {
        carId,
        userId: session?.id ?? null,
        startDate: start,
        endDate: end,
        totalCost,
        contactName,
        contactPhone: normalizePhone(contactPhone),
        contactEmail,
        notes: notes || null,
      },
    });

    return { success: true, bookingId: (booking as Record<string, unknown>).id as string };
  } catch (err) {
    console.error("Rental booking error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
