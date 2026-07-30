/**
 * Which slots a given day offers, and which of them are still free.
 *
 * Availability used to be a hardcoded five-element array with no notion of
 * weekends, holidays or blocked time. It is now driven by three records —
 * weekly working hours, per-date exceptions, and blocked intervals — and this
 * module is the one place that combines them.
 *
 * Everything here is pure and expressed in **minutes from midnight in the
 * business timezone**. Callers do the UTC↔wall-clock conversion once, at the
 * edge, which keeps the rule "what does the shop consider 09:00" out of the
 * arithmetic. That separation matters: the previous implementation compared a
 * UTC `getHours()` against Moscow wall-clock labels, so on a UTC server a
 * booked 09:00 read as "06:00" and never matched — taken slots were offered as
 * free and the customer only discovered the clash on submit.
 */

/** Slot length. Two hours, matching the labels the UI renders ("09:00 — 11:00"). */
export const SLOT_MINUTES = 120;

/** Default opening for a weekday, used when nothing is configured. */
export const DEFAULT_OPEN_MINUTE = 10 * 60;
export const DEFAULT_CLOSE_MINUTE = 20 * 60;

export interface WeeklyHours {
  /** 0 = Sunday … 6 = Saturday (JS `getDay()` convention). */
  dayOfWeek: number;
  isOpen: boolean;
  openMinute: number;
  closeMinute: number;
}

/**
 * The shop's actual opening hours: Пн–Пт 10:00–20:00, Сб 10:00–16:00, Вс закрыто.
 *
 * This is the source of truth for a fresh install and for any weekday with no
 * row yet. It must stay in step with what the contacts page tells customers —
 * a booking form that offers Sunday while the door is locked is worse than one
 * that offers nothing.
 */
export const DEFAULT_WEEK: readonly WeeklyHours[] = [
  { dayOfWeek: 0, isOpen: false, openMinute: 10 * 60, closeMinute: 20 * 60 },
  { dayOfWeek: 1, isOpen: true, openMinute: 10 * 60, closeMinute: 20 * 60 },
  { dayOfWeek: 2, isOpen: true, openMinute: 10 * 60, closeMinute: 20 * 60 },
  { dayOfWeek: 3, isOpen: true, openMinute: 10 * 60, closeMinute: 20 * 60 },
  { dayOfWeek: 4, isOpen: true, openMinute: 10 * 60, closeMinute: 20 * 60 },
  { dayOfWeek: 5, isOpen: true, openMinute: 10 * 60, closeMinute: 20 * 60 },
  { dayOfWeek: 6, isOpen: true, openMinute: 10 * 60, closeMinute: 16 * 60 },
];

export interface DayException {
  isClosed: boolean;
  /** Null means "closed" or "use the weekly hours", per `isClosed`. */
  openMinute: number | null;
  closeMinute: number | null;
}

export interface BlockedRange {
  startMinute: number;
  endMinute: number;
}

export interface DaySlot {
  /** "HH:mm" wall-clock label in the business timezone. */
  time: string;
  available: boolean;
}

export interface ComputeDaySlotsInput {
  /** 0–6, the weekday of the date being asked about, in business time. */
  dayOfWeek: number;
  weekly: readonly WeeklyHours[];
  /** Overrides the weekly row for this specific date, when one exists. */
  exception?: DayException | null;
  /** Booked slot start times, minutes from midnight. */
  bookedMinutes: readonly number[];
  /** Blocked ranges clipped to this day, half-open `[start, end)`. */
  blocked?: readonly BlockedRange[];
  /** Minutes from midnight if this date IS today in business time; else null. */
  nowMinute?: number | null;
  slotMinutes?: number;
}

/** `minutes from midnight` → "HH:mm". */
export function minutesToLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:mm" → minutes from midnight, or null when malformed. */
export function labelToMinutes(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** The opening window for a day, or null when the shop is closed. */
export function resolveDayWindow(
  input: Pick<ComputeDaySlotsInput, "dayOfWeek" | "weekly" | "exception">,
): { openMinute: number; closeMinute: number } | null {
  const { exception } = input;

  // An exception always wins over the weekly rule — that is its whole purpose.
  if (exception) {
    if (exception.isClosed) return null;
    if (exception.openMinute !== null && exception.closeMinute !== null) {
      return exception.closeMinute > exception.openMinute
        ? { openMinute: exception.openMinute, closeMinute: exception.closeMinute }
        : null;
    }
    // "Open, but no custom hours" → fall through to the weekly window.
  }

  const weekly = input.weekly.find((w) => w.dayOfWeek === input.dayOfWeek)
    // No configured row for this weekday: fall back to the shop's stated
    // opening hours rather than inventing one, so an unseeded deploy offers
    // what the contacts page promises instead of a different schedule.
    ?? DEFAULT_WEEK.find((w) => w.dayOfWeek === input.dayOfWeek);
  if (!weekly) return { openMinute: DEFAULT_OPEN_MINUTE, closeMinute: DEFAULT_CLOSE_MINUTE };
  if (!weekly.isOpen) return null;
  if (weekly.closeMinute <= weekly.openMinute) return null;
  return { openMinute: weekly.openMinute, closeMinute: weekly.closeMinute };
}

/**
 * The slot grid for a day, each marked free or taken.
 *
 * A slot is offered when it fits entirely inside the opening window, and is
 * available when nothing is booked at that start, no blocked range overlaps it,
 * and it has not already started today.
 */
export function computeDaySlots(input: ComputeDaySlotsInput): DaySlot[] {
  const slotMinutes = input.slotMinutes ?? SLOT_MINUTES;
  const window = resolveDayWindow(input);
  if (!window) return [];

  const booked = new Set(input.bookedMinutes);
  const blocked = input.blocked ?? [];
  const nowMinute = input.nowMinute ?? null;

  const slots: DaySlot[] = [];
  // Only whole slots are offered: a 09:00–19:00 window at 2h yields five, and a
  // window ending at 18:00 does not offer a 17:00 slot that would overrun.
  for (let start = window.openMinute; start + slotMinutes <= window.closeMinute; start += slotMinutes) {
    const end = start + slotMinutes;
    const overlapsBlocked = blocked.some((b) => b.startMinute < end && b.endMinute > start);
    const isPast = nowMinute !== null && start <= nowMinute;
    slots.push({
      time: minutesToLabel(start),
      available: !booked.has(start) && !overlapsBlocked && !isPast,
    });
  }
  return slots;
}
