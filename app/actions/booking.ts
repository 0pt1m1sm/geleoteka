"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDate, isValidRussianPhone, normalizePhone } from "@/lib/utils";
import {
  findOrCreateGuestCustomer,
  generateClaimToken,
} from "@/lib/customer-onboarding";
import { createDeal } from "@/lib/crm/public";
import { nextRepairOrderNumber } from "@/lib/crm/public";
import { publishServiceBookingCreated } from "@/lib/staff-notifications/business-events";
import type { StaffNotificationPublishTx } from "@/lib/staff-notifications/publish";
import {
  isServiceBayAllocationConflict,
  reserveServiceBaySlot,
  SERVICE_BAY_CONFLICT_MESSAGE,
  type ServiceBayAllocationTx,
} from "@/lib/scheduling/service-bays";

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

    // The server chooses and reserves a physical bay in the same transaction as
    // the RO. Active bay rows serialize competing allocators; the compound
    // Slot(dateTime, bayId) unique key is the database collision backstop.
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
          // The wizard's free-text field is the CLIENT's own description of the
          // problem ("Опишите проблему или пожелания"), so it belongs in
          // `concern` — the customer-complaint field the admin form renders as
          // «Жалоба клиента». `notes` is the master's internal-notes field and
          // must stay empty until a technician writes in it.
          concern: notes || null,
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
      await reserveServiceBaySlot(tx as unknown as ServiceBayAllocationTx, {
        dateTime: appointmentDate,
        repairOrderId: ro.id,
      });
      const customer = (await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })) as { name: string } | null;
      await publishServiceBookingCreated(
        tx as unknown as StaffNotificationPublishTx,
        {
          sourceId: ro.id,
          customerUserId: userId,
          customerName: customer?.name ?? "клиент",
          dealId: deal.id,
          dealNumber: deal.number,
          occurredAt: ro.createdAt,
        },
      );
      return ro;
    });

    // Время записи — по часам сервиса, а не по часам сервера: он работает в UTC,
    // и клиент получал смс на три часа раньше, чем его на самом деле ждут.
    const bookingDay = formatDate(appointmentDate);
    const bookingTime = formatDate(appointmentDate, { dateStyle: undefined, timeStyle: "short" });

    await db.notification.create({
      data: {
        userId,
        type: "BOOKING_CONFIRMATION",
        message: `Запись подтверждена на ${bookingDay} в ${bookingTime}`,
        metadata: { repairOrderId: repairOrder.id },
      },
    });

    // Best effort: the RO/Deal/Slot already committed above, so a downstream
    // SMS gateway outage must not turn an already-successful booking into a
    // reported failure — that would invite the customer to resubmit and
    // double-book.
    try {
      const { sendBookingConfirmation } = await import("@/lib/sms");
      await sendBookingConfirmation(normalizedPhone, bookingDay, bookingTime);
    } catch (err) {
      console.error("[booking sms]", err);
    }

    if (email) {
      const [
        { sendBookingConfirmationEmail, generateOutboundMessageId, recordOutboundEmail, markOutboundEmailFailed, markOutboundEmailSent, isPlausibleEmail },
        { getCMSText },
      ] = await Promise.all([import("@/lib/email"), import("@/lib/cms")]);
      const address = (await getCMSText("contacts.address")) || "";
      const dateLabel = `${bookingDay} в ${bookingTime}`;
      const subject = `Geleoteka — запись на ${dateLabel}`;
      // Адрес подставляется, ТОЛЬКО если он задан: «по адресу: .» в письме
      // клиенту выглядит как сбой, а во время переезда поле может быть пустым.
      const where = address ? ` по адресу: ${address}` : "";
      const bodyText = `Здравствуйте, ${name}. Записываем ваш ${model} ${year} г. на ${dateLabel}${where}. Услуги: ${services.map((s: { name: string }) => s.name).join(", ")}.`;
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

    // Same best-effort rationale as the SMS send above — S+ is an external
    // catalog push, not part of the booking itself.
    try {
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
    } catch (err) {
      console.error("[booking splus]", err);
    }

    return {
      success: true,
      repairOrderId: repairOrder.id,
      userId,
      isReturningCustomer: guestResult.isReturning && guestResult.hasRealPassword,
      claimToken,
    };
  } catch (err) {
    if (isServiceBayAllocationConflict(err)) {
      return { success: false, error: SERVICE_BAY_CONFLICT_MESSAGE };
    }
    console.error("Booking error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
