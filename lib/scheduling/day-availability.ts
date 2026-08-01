import "server-only";

import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { formatForDatetimeLocalInput, parseDatetimeLocalInput } from "@/lib/timezone";
import {
  computeDaySlots,
  type BlockedRange,
  type DaySlot,
  type DayException,
  type WeeklyHours,
} from "@/lib/scheduling/availability";

/**
 * Reads the schedule for one calendar day and hands it to the pure engine.
 *
 * This is the only place UTC meets wall-clock. Every stored instant is UTC;
 * every rule the shop expresses ("we open at nine", "closed on the 4th") is
 * business-local. Converting once here — via the same helpers the admin
 * datetime inputs use — keeps the engine pure and stops the two representations
 * being compared directly, which is precisely the bug this replaces: booked
 * times were derived with `getHours()` on a UTC server and compared against
 * Moscow labels, so they never matched and taken slots were offered as free.
 */

/** Minutes from midnight, business time, for a UTC instant. */
function businessMinutes(instant: Date): number {
  const wall = formatForDatetimeLocalInput(instant); // "YYYY-MM-DDTHH:mm"
  const [, time] = wall.split("T");
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** The business-local calendar day ("YYYY-MM-DD") of a UTC instant. */
function businessDateISO(instant: Date): string {
  return formatForDatetimeLocalInput(instant).split("T")[0];
}

/** UTC bounds of a business-local calendar day, half-open. */
function dayBoundsUtc(dateISO: string): { start: Date; end: Date } | null {
  const start = parseDatetimeLocalInput(`${dateISO}T00:00`);
  if (!start) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function getDaySlots(dateISO: string, now: Date = new Date()): Promise<DaySlot[]> {
  const bounds = dayBoundsUtc(dateISO);
  if (!bounds) return [];

  // getDay() on the day's opening instant is safe: the bound is that day's
  // midnight in business time, so its weekday is the business weekday.
  const dayOfWeek = new Date(
    `${dateISO}T00:00:00.000Z`,
  ).getUTCDay();

  const [weeklyRows, exceptionRow, bookedRows, blockedRows, activeBays] = await Promise.all([
    db.workingHours.findMany({
      select: { dayOfWeek: true, isOpen: true, openMinute: true, closeMinute: true },
    }),
    db.scheduleException.findFirst({
      where: { date: new Date(`${dateISO}T00:00:00.000Z`) },
      select: { isClosed: true, openMinute: true, closeMinute: true },
    }),
    db.slot.findMany({
      where: { dateTime: { gte: bounds.start, lt: bounds.end } },
      select: { dateTime: true, bayId: true },
    }),
    db.blockedInterval.findMany({
      where: { startAt: { lt: bounds.end }, endAt: { gt: bounds.start } },
      select: { startAt: true, endAt: true },
    }),
    db.serviceBay.findMany({
      where: { tenantKey: TENANT_KEY, isActive: true },
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  const weekly = weeklyRows as WeeklyHours[];
  const exception = exceptionRow as DayException | null;

  const booked = (bookedRows as Array<{ dateTime: Date; bayId: string }>).map((slot) => ({
    startMinute: businessMinutes(slot.dateTime),
    bayId: slot.bayId,
  }));

  // Clip each block to this day, so a range spanning midnight still masks the
  // right part of today rather than being dropped or wrapping around.
  const blocked: BlockedRange[] = (blockedRows as Array<{ startAt: Date; endAt: Date }>).map(
    (b) => ({
      startMinute: b.startAt <= bounds.start ? 0 : businessMinutes(b.startAt),
      endMinute: b.endAt >= bounds.end ? 24 * 60 : businessMinutes(b.endAt),
    }),
  );

  const nowMinute = businessDateISO(now) === dateISO ? businessMinutes(now) : null;

  return computeDaySlots({
    dayOfWeek,
    weekly,
    exception,
    activeBayIds: (activeBays as Array<{ id: string }>).map((bay) => bay.id),
    booked,
    blocked,
    nowMinute,
  });
}
