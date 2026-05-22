"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import {
  findOrCreateGuestCustomer,
  generateClaimToken,
} from "@/lib/customer-onboarding";
import { createDeal } from "@/lib/crm/public";
import { nextRepairOrderNumber } from "@/lib/crm/public";

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
  /** Discriminator for error UX. "phone_collision" → render inline login panel. */
  errorKind?: "phone_collision" | "other";
}

export async function createRepairOrder(input: BookingInput): Promise<BookingResult> {
  const { serviceIds, vin, model, year, mileage, trim, dateTime, name, phone, email, notes } = input;

  if (!serviceIds.length || !model || !year || !dateTime || !name || !phone || !email) {
    return { success: false, error: "Не все обязательные поля заполнены" };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!isValidRussianPhone(normalizedPhone)) {
    return { success: false, error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }
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
      return { success: false, error: guestResult.error, errorKind: guestResult.kind };
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

    // Originate the commercial Deal first; the RO is its service fulfillment.
    // Stage starts at QUOTED — booking-form flows always render an estimate
    // step before approval (see Deal+Fulfillment PRD).
    const deal = await createDeal({
      customerUserId: userId,
      vehicleId: vehicle!.id,
      channel: "SERVICE",
      source: "booking-form",
      initialStage: "NEW",
      claimToken,
      notes: notes || null,
    });

    // Slot reservation + RO creation in one transaction. The unique constraint on
    // Slot.dateTime is what actually prevents concurrent double-booking; if two
    // requests race, only one slot.create succeeds — the other rolls back its RO.
    const repairOrder = await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      const roNumber = await nextRepairOrderNumber(tx);
      const ro = await tx.repairOrder.create({
        data: {
          userId,
          vehicleId: vehicle!.id,
          trimId: validatedTrimId,
          dateTime: appointmentDate,
          status: "SCHEDULED",
          claimToken,
          dealId: deal.id,
          notes: notes || null,
          roNumber,
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

    if (email) {
      const [
        { sendBookingConfirmationEmail, generateOutboundMessageId, recordOutboundEmail, markOutboundEmailFailed, markOutboundEmailSent, isPlausibleEmail },
        { getCMSText },
      ] = await Promise.all([import("@/lib/email"), import("@/lib/cms")]);
      const address = (await getCMSText("contacts.address")) || "Москва, ул. Примерная, 15";
      const dateLabel = `${appointmentDate.toLocaleDateString("ru-RU")} в ${appointmentDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
      const subject = `Geleoteka — запись на ${dateLabel}`;
      const bodyText = `Здравствуйте, ${name}. Записываем ваш ${model} ${year} г. на ${dateLabel} по адресу: ${address}. Услуги: ${services.map((s: { name: string }) => s.name).join(", ")}.`;
      const messageId = generateOutboundMessageId();
      // Persist FIRST so a fast customer reply can match externalId
      // before our post-send write would otherwise land.
      if (isPlausibleEmail(email)) {
        await recordOutboundEmail({
          customerUserId: userId,
          dealId: deal.id,
          subject,
          body: bodyText,
          messageId,
        });
      }
      void sendBookingConfirmationEmail(
        email,
        {
          customerName: name,
          dateTime: appointmentDate,
          vehicleSummary: `${model} ${year} г.`,
          services: services.map((s: { name: string }) => s.name),
          address,
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
