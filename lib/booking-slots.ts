/**
 * Single source of truth for the booking calendar's bookable slot grid.
 * Both /api/slots (server) and CalendarSlotPicker (client fallback) read from
 * here — keeping them in sync prevents the customer-facing picker drifting
 * from the server's availability check.
 *
 * Slots are 2 hours long. Working hours per CMS contacts.workingHours:
 * Пн–Пт 09:00–19:00, so 5 slots: 09–11, 11–13, 13–15, 15–17, 17–19.
 */
export const WORK_HOURS: readonly string[] = [
  "09:00",
  "11:00",
  "13:00",
  "15:00",
  "17:00",
];

/** Slot length in hours. Used by UI labels ("09:00 — 11:00"). */
export const SLOT_HOURS = 2;
