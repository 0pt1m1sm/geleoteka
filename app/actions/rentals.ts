"use server";

import { redirect } from "next/navigation";
import { requireRole, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import { deleteOrphanImages, parsePhotosFromForm } from "@/lib/uploads";
import { findOrCreateGuestCustomer, generateClaimToken } from "@/lib/customer-onboarding";
import { createDeal } from "@/lib/crm/public";
import { nextRentalBookingNumber } from "@/lib/crm/internal/next-number";

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
    data: { status: status as "BOOKED" | "ACTIVE" | "RETURNED" | "CANCELLED" },
  });
}

export interface UpdateRentalBookingResult {
  error: string | null;
}

/**
 * Admin edit of a RentalBooking — dates, contact info, total, notes.
 * Vehicle reassignment is intentionally out of scope (would require
 * re-checking slot availability against other bookings — overkill for
 * the common case where the manager just needs to fix a typo or shift
 * dates). For a vehicle change, delete + recreate.
 */
export async function updateRentalBooking(
  bookingId: string,
  formData: FormData,
): Promise<UpdateRentalBookingResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const startRaw = ((formData.get("startDate") as string | null) ?? "").trim();
  const endRaw = ((formData.get("endDate") as string | null) ?? "").trim();
  const contactName = ((formData.get("contactName") as string | null) ?? "").trim();
  const contactPhoneRaw = ((formData.get("contactPhone") as string | null) ?? "").trim();
  const contactEmail = ((formData.get("contactEmail") as string | null) ?? "").trim().toLowerCase();
  const totalCostRaw = ((formData.get("totalCost") as string | null) ?? "").trim();
  const notes = ((formData.get("notes") as string | null) ?? "").trim() || null;

  if (!contactName) return { error: "Имя обязательно" };
  if (!isValidRussianPhone(contactPhoneRaw)) {
    return { error: "Телефон должен быть в формате +7XXXXXXXXXX" };
  }
  if (!startRaw || !endRaw) return { error: "Укажите даты начала и конца" };
  const startDate = new Date(startRaw);
  const endDate = new Date(endRaw);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Некорректные даты" };
  }
  if (endDate <= startDate) return { error: "Дата возврата должна быть позже даты выдачи" };
  const totalCost = Number.parseInt(totalCostRaw, 10);
  if (!Number.isFinite(totalCost) || totalCost < 0) {
    return { error: "Некорректная сумма" };
  }

  await db.rentalBooking.update({
    where: { id: bookingId },
    data: {
      startDate,
      endDate,
      contactName,
      contactPhone: normalizePhone(contactPhoneRaw),
      contactEmail,
      totalCost,
      notes,
    },
  });

  return { error: null };
}

/**
 * Hard-delete a RentalBooking. The parent Deal stays (dealId is SetNull
 * on cascade) — deals are independent commercial records that survive
 * fulfillment changes.
 */
export async function deleteRentalBooking(
  bookingId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  try {
    await db.rentalBooking.delete({ where: { id: bookingId } });
  } catch (err) {
    console.error("[deleteRentalBooking]", err);
    return { error: "Не удалось удалить бронирование" };
  }
  return { error: null };
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
  /** Set when success=true. User the booking was attached to. */
  userId?: string;
  /** True only when matched an existing user with a real password. */
  isReturningCustomer?: boolean;
  /** One-shot claim secret. Returned only for guest creates (no session). null when user was already logged in. */
  claimToken?: string | null;
  error?: string;
  /** Discriminator for error UX. "phone_collision" → render inline login panel. */
  errorKind?: "phone_collision" | "other";
}

export async function createRentalBooking(input: RentalBookingInput): Promise<RentalBookingResult> {
  const { carId, startDate, endDate, contactName, contactPhone, contactEmail, notes } = input;

  if (!carId || !startDate || !endDate || !contactName || !contactPhone || !contactEmail) {
    return { success: false, error: "Заполните все обязательные поля" };
  }

  if (!isValidRussianPhone(normalizePhone(contactPhone))) {
    return { success: false, error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
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
      select: { dailyRate: true, ownershipType: true, make: true, model: true, year: true },
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
    const guestResult = await findOrCreateGuestCustomer({
      sessionUserId: session?.id ?? null,
      name: contactName,
      email: contactEmail,
      phone: normalizePhone(contactPhone),
    });
    if (!guestResult.ok) {
      return { success: false, error: guestResult.error, errorKind: guestResult.kind };
    }
    const claimToken = !session ? generateClaimToken() : null;

    // Originate the Deal first. Rental booking is point-of-sale —
    // stage starts at APPROVED so the deal is on the books immediately.
    const deal = await createDeal({
      customerUserId: guestResult.userId,
      vehicleId: carId,
      channel: "RENTAL",
      source: "rentals-form",
      initialStage: "IN_PROGRESS",
      claimToken,
      notes: notes || null,
      lines: [
        {
          type: "RENTAL_DAY",
          description: `Аренда: ${vehicle.make ?? "Mercedes-Benz"} ${vehicle.model}`,
          qty: days,
          unitPrice: vehicle.dailyRate,
        },
      ],
    });

    const bookingNumber = await nextRentalBookingNumber();
    const booking = await db.rentalBooking.create({
      data: {
        vehicleId: carId,
        userId: guestResult.userId,
        dealId: deal.id,
        startDate: start,
        endDate: end,
        totalCost,
        contactName,
        contactPhone: normalizePhone(contactPhone),
        contactEmail: contactEmail.trim().toLowerCase(),
        claimToken,
        notes: notes || null,
        bookingNumber,
      },
    });

    if (contactEmail) {
      const [
        {
          sendRentalBookingConfirmationEmail,
          generateOutboundMessageId,
          recordOutboundEmail,
          markOutboundEmailFailed,
          markOutboundEmailSent,
          isPlausibleEmail,
        },
        { getCMSText },
      ] = await Promise.all([import("@/lib/email"), import("@/lib/cms")]);
      const pickupAddress = (await getCMSText("contacts.address")) || "Москва, ул. Примерная, 15";
      const vehicleSummary = `${vehicle.make ?? "Mercedes-Benz"} ${vehicle.model}${vehicle.year ? ` ${vehicle.year} г.` : ""}`;
      const subject = "Geleoteka — бронь автомобиля подтверждена";
      const bodyText = `Здравствуйте, ${contactName}. Бронь ${vehicleSummary} на ${days} дн. подтверждена. Сумма: ${(totalCost / 100).toLocaleString("ru-RU")} ₽.`;
      const messageId = generateOutboundMessageId();
      if (isPlausibleEmail(contactEmail)) {
        await recordOutboundEmail({
          customerUserId: guestResult.userId,
          dealId: deal.id,
          subject,
          body: bodyText,
          messageId,
        });
      }
      void sendRentalBookingConfirmationEmail(
        contactEmail,
        {
          customerName: contactName,
          vehicleSummary,
          startAt: start,
          endAt: end,
          totalDays: days,
          totalPrice: totalCost,
          pickupAddress,
        },
        { messageId },
      )
        .then((result) => {
          if (!result.success) return markOutboundEmailFailed(messageId, result.error);
          return markOutboundEmailSent(messageId);
        })
        .catch((err) =>
          markOutboundEmailFailed(messageId, err instanceof Error ? err.message : String(err)),
        );
    }

    return {
      success: true,
      bookingId: booking.id,
      userId: guestResult.userId,
      isReturningCustomer: guestResult.isReturning && guestResult.hasRealPassword,
      claimToken,
    };
  } catch (err) {
    console.error("Rental booking error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
