"use server";

import { redirect } from "next/navigation";
import { requireRole, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/utils";
import { deleteOrphanImages, parsePhotosFromForm } from "@/lib/uploads";

interface VehicleFormData {
  model: string;
  year: number;
  dailyRate: number;
  description: string | null;
  color: string | null;
  plate: string | null;
  mileage: number;
  engine: string | null;
  horsepower: number | null;
  transmission: string | null;
  seats: number;
  isAvailable: boolean;
  features: string[];
}

function parseCarFormData(formData: FormData): VehicleFormData {
  const model = (formData.get("model") as string)?.trim();
  const year = parseInt(formData.get("year") as string);
  const dailyRate = parseInt(formData.get("dailyRate") as string);
  const description = (formData.get("description") as string)?.trim() || null;
  const color = (formData.get("color") as string)?.trim() || null;
  const plate = (formData.get("plate") as string)?.trim().toUpperCase() || null;
  const mileage = parseInt(formData.get("mileage") as string) || 0;
  const engine = (formData.get("engine") as string)?.trim() || null;
  const horsepower = parseInt(formData.get("horsepower") as string) || null;
  const transmission = (formData.get("transmission") as string)?.trim() || null;
  const seats = parseInt(formData.get("seats") as string) || 5;
  const isAvailable = formData.get("isAvailable") !== "off";
  const featuresRaw = (formData.get("features") as string) || "";
  const features = featuresRaw.split("\n").map((f) => f.trim()).filter(Boolean);

  return { model, year, dailyRate, description, color, plate, mileage, engine, horsepower, transmission, seats, isAvailable, features };
}

export async function createRentalCar(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseCarFormData(formData);
  const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
  if (photoErr) return { error: photoErr };

  if (!data.model || isNaN(data.year) || isNaN(data.dailyRate)) {
    return { error: "Модель, год и стоимость обязательны" };
  }

  await db.vehicle.create({
    data: { ...data, ownershipType: "RENTAL", photos: photoUrls },
  });

  redirect("/admin/rentals");
}

export async function updateRentalCar(
  carId: string, // Vehicle.id
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const data = parseCarFormData(formData);
  const { urls: photoUrls, error: photoErr } = parsePhotosFromForm(formData.get("photos"));
  if (photoErr) return { error: photoErr };

  if (!data.model || isNaN(data.year) || isNaN(data.dailyRate)) {
    return { error: "Модель, год и стоимость обязательны" };
  }

  // Persist new photos[] and ref-counted-delete UploadedImage rows for any URL
  // that no other Part/Vehicle still references.
  await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    const current = (await tx.vehicle.findUnique({
      where: { id: carId },
      select: { photos: true },
    })) as { photos: string[] } | null;
    const removed = (current?.photos ?? []).filter((u: string) => !photoUrls.includes(u));
    await tx.vehicle.update({
      where: { id: carId },
      data: { ...data, photos: photoUrls },
    });
    if (removed.length > 0) {
      await deleteOrphanImages(removed, tx);
    }
  });

  redirect("/admin/rentals");
}

export async function deleteRentalCar(carId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  // Soft-delete: hard-delete cascades to RentalBooking + RepairOrder, wiping history.
  await db.vehicle.update({
    where: { id: carId },
    data: { isArchived: true, isAvailable: false },
  });
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
  carId: string; // Vehicle.id
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
    const vehicle = await db.vehicle.findUnique({
      where: { id: carId },
      select: { dailyRate: true, ownershipType: true },
    });
    if (!vehicle || vehicle.ownershipType !== "RENTAL" || !vehicle.dailyRate) {
      return { success: false, error: "Автомобиль не найден" };
    }

    const overlap = await db.rentalBooking.findFirst({
      where: {
        vehicleId: carId,
        status: { notIn: ["CANCELLED", "RETURNED"] },
        OR: [{ startDate: { lte: end }, endDate: { gte: start } }],
      },
    });

    if (overlap) {
      return { success: false, error: "Автомобиль занят на выбранные даты" };
    }

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const totalCost = days * vehicle.dailyRate;

    const session = await getSession();

    const booking = await db.rentalBooking.create({
      data: {
        vehicleId: carId,
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

    return { success: true, bookingId: booking.id };
  } catch (err) {
    console.error("Rental booking error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
