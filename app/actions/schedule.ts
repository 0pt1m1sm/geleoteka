"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DEFAULT_CLOSE_MINUTE,
  DEFAULT_OPEN_MINUTE,
  labelToMinutes,
} from "@/lib/scheduling/availability";
import { parseDatetimeLocalInput } from "@/lib/timezone";

/**
 * Editing the shop's schedule: weekly hours, per-date exceptions (holidays and
 * special hours) and blocked intervals.
 *
 * These writes change what the public booking wizard offers, so they are
 * ADMIN/MANAGER-only and always revalidate both the admin calendar and the
 * booking step that reads availability.
 *
 * Nothing here deletes or moves an existing booking: closing a day or blocking
 * an interval only stops NEW bookings. Orders already placed in that time stay
 * exactly where they are, and the calendar keeps showing them — a schedule edit
 * must never silently strand a customer who already has an appointment.
 */

export interface ScheduleResult {
  error: string | null;
  success?: boolean;
  /** The write succeeded, but the operator needs to know something about it. */
  warning?: string;
}

function revalidateSchedule(): void {
  revalidatePath("/admin/calendar");
  revalidatePath("/booking/step-2");
}

/** Read "HH:mm" from a form field, returning null when absent/blank. */
function readTime(formData: FormData, key: string): { ok: true; value: number | null } | { ok: false } {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return { ok: true, value: null };
  const minutes = labelToMinutes(raw);
  return minutes === null ? { ok: false } : { ok: true, value: minutes };
}

/**
 * Save the whole week in one submit.
 *
 * Previously each weekday was its own form and its own Save button — seven
 * buttons for one decision. Nobody edits a single day in isolation: the shop
 * changes its hours, not its Tuesday. One form also makes the week validate as
 * a unit, so "Saturday closes before it opens" is caught before anything is
 * written rather than leaving six saved days and one rejected.
 */
export async function saveWeeklySchedule(
  _prevState: ScheduleResult | null,
  formData: FormData,
): Promise<ScheduleResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const DAY_NAMES = [
    "воскресенье",
    "понедельник",
    "вторник",
    "среду",
    "четверг",
    "пятницу",
    "субботу",
  ];

  const parsed: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    openMinute: number;
    closeMinute: number;
  }> = [];

  for (let day = 0; day <= 6; day += 1) {
    const isOpen = formData.get(`isOpen-${day}`) !== null;
    const open = readTime(formData, `openTime-${day}`);
    const close = readTime(formData, `closeTime-${day}`);
    if (!open.ok || !close.ok) {
      return { error: `Некорректное время в поле «${DAY_NAMES[day]}» (ожидается ЧЧ:ММ)` };
    }

    const openMinute = open.value ?? DEFAULT_OPEN_MINUTE;
    const closeMinute = close.value ?? DEFAULT_CLOSE_MINUTE;

    // Validate the whole week BEFORE writing any of it.
    if (isOpen && closeMinute <= openMinute) {
      return { error: `В ${DAY_NAMES[day]} время закрытия должно быть позже открытия` };
    }

    parsed.push({ dayOfWeek: day, isOpen, openMinute, closeMinute });
  }

  await db.$transaction(
    parsed.map((d) =>
      db.workingHours.upsert({
        where: { dayOfWeek: d.dayOfWeek },
        update: { isOpen: d.isOpen, openMinute: d.openMinute, closeMinute: d.closeMinute },
        create: d,
      }),
    ),
  );

  revalidateSchedule();
  return { error: null, success: true };
}

/** Add or update a holiday / special-hours day. */
export async function saveScheduleException(
  _prevState: ScheduleResult | null,
  formData: FormData,
): Promise<ScheduleResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const dateRaw = formData.get("date");
  if (typeof dateRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return { error: "Укажите дату" };
  }
  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { error: "Некорректная дата" };

  const isClosed = formData.get("isClosed") === "on" || formData.get("isClosed") === "true";
  const open = readTime(formData, "openTime");
  const close = readTime(formData, "closeTime");
  if (!open.ok || !close.ok) return { error: "Некорректное время (ожидается ЧЧ:ММ)" };

  if (!isClosed) {
    // "Open" with only one bound is ambiguous — it would silently fall back to
    // the weekly hours and look like the entry did nothing.
    if ((open.value === null) !== (close.value === null)) {
      return { error: "Для особых часов укажите и начало, и конец" };
    }
    if (open.value !== null && close.value !== null && close.value <= open.value) {
      return { error: "Время закрытия должно быть позже открытия" };
    }
  }

  const reasonRaw = formData.get("reason");
  const reason = typeof reasonRaw === "string" && reasonRaw.trim() !== "" ? reasonRaw.trim() : null;

  await db.scheduleException.upsert({
    where: { date },
    update: {
      isClosed,
      openMinute: isClosed ? null : open.value,
      closeMinute: isClosed ? null : close.value,
      reason,
    },
    create: {
      date,
      isClosed,
      openMinute: isClosed ? null : open.value,
      closeMinute: isClosed ? null : close.value,
      reason,
    },
  });

  revalidateSchedule();
  return { error: null, success: true };
}

export async function deleteScheduleException(id: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  await db.scheduleException.delete({ where: { id } });
  revalidateSchedule();
}

/** Block a time range so nothing new can be booked into it. */
export async function saveBlockedInterval(
  _prevState: ScheduleResult | null,
  formData: FormData,
): Promise<ScheduleResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const startRaw = formData.get("startAt");
  const endRaw = formData.get("endAt");
  if (typeof startRaw !== "string" || typeof endRaw !== "string" || !startRaw || !endRaw) {
    return { error: "Укажите начало и конец интервала" };
  }

  const startAt = parseDatetimeLocalInput(startRaw);
  const endAt = parseDatetimeLocalInput(endRaw);
  if (!startAt || !endAt) return { error: "Некорректные дата и время" };
  if (endAt <= startAt) return { error: "Конец интервала должен быть позже начала" };

  const reasonRaw = formData.get("reason");
  const reason = typeof reasonRaw === "string" && reasonRaw.trim() !== "" ? reasonRaw.trim() : null;

  // Warn rather than refuse: the shop may legitimately block time around an
  // existing order (a car staying overnight), and refusing would leave no way
  // to record that. The booking itself is never touched.
  const conflicting = await db.slot.count({
    where: { dateTime: { gte: startAt, lt: endAt } },
  });

  await db.blockedInterval.create({ data: { startAt, endAt, reason } });

  revalidateSchedule();
  return {
    error: null,
    success: true,
    warning:
      conflicting > 0
        ? `Интервал заблокирован, но в него попадают уже существующие записи (${conflicting}). Перенесите их вручную.`
        : undefined,
  };
}

export async function deleteBlockedInterval(id: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  await db.blockedInterval.delete({ where: { id } });
  revalidateSchedule();
}

/**
 * Заблокировать или освободить конкретный слот — клик по нему в календаре.
 *
 * Отдельной секции «Блокировка времени» с двумя полями даты больше нет: чтобы
 * закрыть окно на вторник, менеджер набирал вручную обе границы интервала,
 * зная сетку наизусть. Слот уже нарисован на экране и знает свои границы —
 * он и есть естественный орган управления.
 *
 * Переключатель, а не две команды: у слота два состояния, и решать, какое
 * действие применимо, должен код, а не оператор.
 */
export async function toggleSlotBlock(
  date: string,
  startMinute: number,
  slotMinutes: number,
  reason?: string | null,
): Promise<{ error: string | null; blocked?: boolean; removedRange?: string }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const pad = (n: number): string => String(n).padStart(2, "0");
  const label = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const startAt = parseDatetimeLocalInput(`${date}T${label(startMinute)}`);
  const endAt = parseDatetimeLocalInput(`${date}T${label(startMinute + slotMinutes)}`);
  if (!startAt || !endAt) return { error: "Некорректный слот" };

  // Полуоткрытые интервалы: блокировка 12:00—14:00 не задевает слот 14:00—16:00.
  const existing = (await db.blockedInterval.findFirst({
    where: { startAt: { lt: endAt }, endAt: { gt: startAt } },
    select: { id: true, startAt: true, endAt: true },
  })) as { id: string; startAt: Date; endAt: Date } | null;

  if (existing) {
    await db.blockedInterval.delete({ where: { id: existing.id } });
    revalidateSchedule();
    return { error: null, blocked: false };
  }

  await db.blockedInterval.create({
    data: { startAt, endAt, reason: reason?.trim() || null },
  });
  revalidateSchedule();
  return { error: null, blocked: true };
}
