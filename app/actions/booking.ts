"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";
import {
  findOrCreateGuestCustomer,
  generateClaimToken,
} from "@/lib/customer-onboarding";

interface BookingInput {
  serviceIds: string[];
  vin: string;
  model: string;
  year: string;
  mileage: string;
  /** Trim id captured by the booking step 1 dropdown. Empty = "Не уверен". */
  trim?: string;
  dateTime: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  loanerCar: boolean;
  waitAtService: boolean;
}

interface BookingResult {
  success: boolean;
  repairOrderId?: string;
  /** Set when success=true. Identifies the customer the order was attached to. */
  userId?: string;
  /** True only when matched an existing user with a real password. UI uses this to choose initial tab. */
  isReturningCustomer?: boolean;
  /** One-shot claim secret. Returned only for guest creates (no session). null when user was already logged in. */
  claimToken?: string | null;
  error?: string;
}

export async function createRepairOrder(input: BookingInput): Promise<BookingResult> {
  const { serviceIds, vin, model, year, mileage, trim, dateTime, name, phone, email, notes } = input;

  if (!serviceIds.length || !model || !year || !dateTime || !name || !phone || !email) {
    return { success: false, error: "Не все обязательные поля заполнены" };
  }

  const normalizedPhone = normalizePhone(phone);
  const appointmentDate = new Date(dateTime);

  if (isNaN(appointmentDate.getTime())) {
    return { success: false, error: "Некорректная дата" };
  }

  if (appointmentDate <= new Date()) {
    return { success: false, error: "Дата должна быть в будущем" };
  }

  try {
    const session = await getSession();
    const guestResult = await findOrCreateGuestCustomer({
      sessionUserId: session?.id ?? null,
      name,
      email,
      phone: normalizedPhone,
    });
    if (!guestResult.ok) {
      return { success: false, error: guestResult.error };
    }
    const userId = guestResult.userId;
    const claimToken = !session ? generateClaimToken() : null;

    let vehicle = vin
      ? await db.vehicle.findUnique({ where: { vin } })
      : null;

    if (!vehicle) {
      vehicle = await db.vehicle.create({
        data: {
          ownershipType: "CUSTOMER",
          ownerUserId: userId,
          vin: vin || null,
          model,
          year: parseInt(year),
          mileage: mileage ? parseInt(mileage) : 0,
        },
      });
    }

    const services = await db.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, priceMin: true },
    });

    // Validate trim id: only persist when it points at an existing trim.
    // Bad ids degrade gracefully to NULL — the booking still goes through.
    let validatedTrimId: string | null = null;
    if (trim && trim.trim() !== "") {
      const found = await db.vehicleTrim.findUnique({
        where: { id: trim },
        select: { id: true },
      });
      if (found) validatedTrimId = (found as { id: string }).id;
    }

    // Slot reservation + RO creation in one transaction. The unique constraint on
    // Slot.dateTime is what actually prevents concurrent double-booking; if two
    // requests race, only one slot.create succeeds — the other rolls back its RO.
    const repairOrder = await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      const ro = await tx.repairOrder.create({
        data: {
          userId,
          vehicleId: vehicle!.id,
          trimId: validatedTrimId,
          dateTime: appointmentDate,
          status: "ESTIMATE",
          claimToken,
          notes: notes || null,
          jobLines: {
            create: services.map((s: { id: string; name: string; priceMin: number | null }, idx: number) => ({
              sortOrder: idx,
              description: s.name,
              status: "PROPOSED" as const,
            })),
          },
        },
      });
      await tx.slot.create({
        data: { dateTime: appointmentDate, repairOrderId: ro.id },
      });
      return ro;
    });

    await db.notification.create({
      data: {
        userId,
        type: "BOOKING_CONFIRMATION",
        message: `Запись подтверждена на ${appointmentDate.toLocaleDateString("ru-RU")} в ${appointmentDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
        metadata: { repairOrderId: repairOrder.id },
      },
    });

    const { sendBookingConfirmation } = await import("@/lib/sms");
    await sendBookingConfirmation(
      normalizedPhone,
      appointmentDate.toLocaleDateString("ru-RU"),
      appointmentDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    );

    const { pushAppointment: splusPush } = await import("@/lib/splus");
    await splusPush({
      clientName: name,
      clientPhone: normalizedPhone,
      clientEmail: email,
      vehicleModel: model,
      vehicleYear: parseInt(year),
      vehicleVin: vin || undefined,
      services: serviceIds,
      dateTime: appointmentDate.toISOString(),
      notes: notes || undefined,
    });

    return {
      success: true,
      repairOrderId: repairOrder.id,
      userId,
      isReturningCustomer: guestResult.isReturning && guestResult.hasRealPassword,
      claimToken,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { success: false, error: "Этот слот уже занят. Выберите другое время." };
    }
    console.error("Booking error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
