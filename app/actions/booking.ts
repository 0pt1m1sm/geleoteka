"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

interface BookingInput {
  serviceIds: string[];
  vin: string;
  model: string;
  year: string;
  mileage: string;
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
  appointmentId?: string;
  error?: string;
}

export async function createAppointment(input: BookingInput): Promise<BookingResult> {
  const { serviceIds, vin, model, year, mileage, dateTime, name, phone, email, notes } = input;

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
    // Use session user if logged in, otherwise find/create by email
    const session = await getSession();
    let user = session
      ? await db.user.findUnique({ where: { id: session.id } })
      : null;

    if (!user) {
      user = await db.user.findUnique({ where: { email } });
    }

    if (!user) {
      user = await db.user.findUnique({ where: { phone: normalizedPhone } });
    }

    if (!user) {
      // Create guest user (no password — can register later)
      const bcrypt = await import("bcryptjs");
      const tempPasswordHash = await bcrypt.hash(Math.random().toString(36), 10);
      user = await db.user.create({
        data: {
          email,
          phone: normalizedPhone,
          name,
          passwordHash: tempPasswordHash,
        },
      });

      // Create loyalty account
      await db.loyaltyAccount.create({
        data: { userId: user.id },
      });
    }

    // Find or create car
    let car = vin
      ? await db.car.findUnique({ where: { vin } })
      : null;

    if (!car) {
      car = await db.car.create({
        data: {
          userId: user.id,
          vin: vin || null,
          model,
          year: parseInt(year),
          mileage: mileage ? parseInt(mileage) : 0,
        },
      });
    }

    // Create appointment with slot locking via unique constraint
    const appointment = await db.appointment.create({
      data: {
        userId: user.id,
        carId: car.id,
        dateTime: appointmentDate,
        notes: notes || null,
        services: {
          create: serviceIds.map((serviceId) => ({ serviceId })),
        },
      },
    });

    // Create booking confirmation notification
    await db.notification.create({
      data: {
        userId: user.id,
        type: "BOOKING_CONFIRMATION",
        message: `Запись подтверждена на ${appointmentDate.toLocaleDateString("ru-RU")} в ${appointmentDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
        metadata: { appointmentId: appointment.id },
      },
    });

    // Send SMS confirmation
    const { sendBookingConfirmation } = await import("@/lib/sms");
    await sendBookingConfirmation(
      normalizedPhone,
      appointmentDate.toLocaleDateString("ru-RU"),
      appointmentDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    );

    // Push to SPlus
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

    return { success: true, appointmentId: appointment.id };
  } catch (err) {
    // Check for unique constraint violation (slot already taken)
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { success: false, error: "Этот слот уже занят. Выберите другое время." };
    }
    console.error("Booking error:", err);
    return { success: false, error: "Произошла ошибка. Попробуйте позже." };
  }
}
