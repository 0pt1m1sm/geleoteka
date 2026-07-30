import { describe, expect, it } from "vitest";

import {
  computeDaySlots,
  labelToMinutes,
  minutesToLabel,
  resolveDayWindow,
  type WeeklyHours,
} from "@/lib/scheduling/availability";

/**
 * Story 1 — the calendar becomes editable, so availability stops being a
 * hardcoded array and starts obeying working hours, holidays and blocks.
 *
 * The baseline every case is measured against is the behaviour customers see
 * today: Пн–Пт 09:00–19:00 in two-hour slots → 09, 11, 13, 15, 17.
 */

const MON_FRI_9_19: WeeklyHours[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isOpen: dayOfWeek >= 1 && dayOfWeek <= 5,
  openMinute: 9 * 60,
  closeMinute: 19 * 60,
}));

const MONDAY = 1;
const SUNDAY = 0;

function times(slots: { time: string }[]): string[] {
  return slots.map((s) => s.time);
}
function freeTimes(slots: { time: string; available: boolean }[]): string[] {
  return slots.filter((s) => s.available).map((s) => s.time);
}

describe("computeDaySlots — the grid", () => {
  it("reproduces the historical 09/11/13/15/17 grid on a working day", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      bookedMinutes: [],
    });

    expect(times(slots)).toEqual(["09:00", "11:00", "13:00", "15:00", "17:00"]);
    expect(freeTimes(slots)).toHaveLength(5);
  });

  it("offers nothing on a closed weekday", () => {
    expect(
      computeDaySlots({ dayOfWeek: SUNDAY, weekly: MON_FRI_9_19, bookedMinutes: [] }),
    ).toEqual([]);
  });

  it("follows edited working hours", () => {
    const weekly = MON_FRI_9_19.map((w) =>
      w.dayOfWeek === MONDAY ? { ...w, openMinute: 10 * 60, closeMinute: 16 * 60 } : w,
    );

    const slots = computeDaySlots({ dayOfWeek: MONDAY, weekly, bookedMinutes: [] });

    expect(times(slots)).toEqual(["10:00", "12:00", "14:00"]);
  });

  it("never offers a slot that would overrun closing time", () => {
    const weekly = MON_FRI_9_19.map((w) =>
      w.dayOfWeek === MONDAY ? { ...w, closeMinute: 18 * 60 } : w,
    );

    const slots = computeDaySlots({ dayOfWeek: MONDAY, weekly, bookedMinutes: [] });

    // 17:00 would end at 19:00, past an 18:00 close.
    expect(times(slots)).toEqual(["09:00", "11:00", "13:00", "15:00"]);
  });

  it("falls back to the shop's real hours when no weekly row is configured", () => {
    // An unseeded install must offer what the contacts page promises —
    // Пн–Пт 10:00–20:00 — not some other invented window.
    const slots = computeDaySlots({ dayOfWeek: MONDAY, weekly: [], bookedMinutes: [] });

    expect(times(slots)).toEqual(["10:00", "12:00", "14:00", "16:00", "18:00"]);
  });

  it("falls back to a short Saturday and a closed Sunday", () => {
    expect(times(computeDaySlots({ dayOfWeek: 6, weekly: [], bookedMinutes: [] }))).toEqual([
      "10:00",
      "12:00",
      "14:00",
    ]);
    expect(computeDaySlots({ dayOfWeek: SUNDAY, weekly: [], bookedMinutes: [] })).toEqual([]);
  });
});

describe("computeDaySlots — what makes a slot unavailable", () => {
  it("marks a booked start time taken", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      bookedMinutes: [13 * 60],
    });

    expect(freeTimes(slots)).toEqual(["09:00", "11:00", "15:00", "17:00"]);
    // Still listed, just not free — the grid shape does not change.
    expect(times(slots)).toHaveLength(5);
  });

  it("blocks every slot a blocked range overlaps, not just its start", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      bookedMinutes: [],
      // 12:00–14:00 straddles the 11:00 and 13:00 slots.
      blocked: [{ startMinute: 12 * 60, endMinute: 14 * 60 }],
    });

    expect(freeTimes(slots)).toEqual(["09:00", "15:00", "17:00"]);
  });

  it("treats a block touching a slot boundary as not overlapping", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      bookedMinutes: [],
      // Ends exactly when the 11:00 slot starts — half-open, so no clash.
      blocked: [{ startMinute: 9 * 60, endMinute: 11 * 60 }],
    });

    expect(freeTimes(slots)).toEqual(["11:00", "13:00", "15:00", "17:00"]);
  });

  it("hides slots that have already started today", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      bookedMinutes: [],
      nowMinute: 13 * 60 + 5,
    });

    expect(freeTimes(slots)).toEqual(["15:00", "17:00"]);
  });

  it("does not apply the past-time rule to other days", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      bookedMinutes: [],
      nowMinute: null,
    });

    expect(freeTimes(slots)).toHaveLength(5);
  });
});

describe("resolveDayWindow — exceptions and holidays", () => {
  it("closes the shop for a holiday even on a working weekday", () => {
    const slots = computeDaySlots({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      exception: { isClosed: true, openMinute: null, closeMinute: null },
      bookedMinutes: [],
    });

    expect(slots).toEqual([]);
  });

  it("opens a normally-closed day via an exception with custom hours", () => {
    const slots = computeDaySlots({
      dayOfWeek: SUNDAY,
      weekly: MON_FRI_9_19,
      exception: { isClosed: false, openMinute: 10 * 60, closeMinute: 14 * 60 },
      bookedMinutes: [],
    });

    expect(times(slots)).toEqual(["10:00", "12:00"]);
  });

  it("falls back to weekly hours for an exception that only says 'open'", () => {
    const window = resolveDayWindow({
      dayOfWeek: MONDAY,
      weekly: MON_FRI_9_19,
      exception: { isClosed: false, openMinute: null, closeMinute: null },
    });

    expect(window).toEqual({ openMinute: 9 * 60, closeMinute: 19 * 60 });
  });

  it("refuses a nonsensical window instead of emitting an endless grid", () => {
    expect(
      resolveDayWindow({
        dayOfWeek: MONDAY,
        weekly: MON_FRI_9_19,
        exception: { isClosed: false, openMinute: 18 * 60, closeMinute: 9 * 60 },
      }),
    ).toBeNull();

    const inverted = MON_FRI_9_19.map((w) =>
      w.dayOfWeek === MONDAY ? { ...w, openMinute: 19 * 60, closeMinute: 9 * 60 } : w,
    );
    expect(resolveDayWindow({ dayOfWeek: MONDAY, weekly: inverted })).toBeNull();
  });
});

describe("label helpers", () => {
  it("round-trips wall-clock labels", () => {
    expect(minutesToLabel(9 * 60)).toBe("09:00");
    expect(minutesToLabel(0)).toBe("00:00");
    expect(minutesToLabel(19 * 60 + 30)).toBe("19:30");
    expect(labelToMinutes("09:00")).toBe(9 * 60);
    expect(labelToMinutes("9:05")).toBe(9 * 60 + 5);
  });

  it("rejects malformed labels rather than guessing", () => {
    expect(labelToMinutes("")).toBeNull();
    expect(labelToMinutes("25:00")).toBeNull();
    expect(labelToMinutes("09:70")).toBeNull();
    expect(labelToMinutes("nine")).toBeNull();
  });
});
