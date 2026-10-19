/**
 * Slots are 2 hours long. Working hours per CMS contacts.workingHours:
 * Пн–Пт 09:00–19:00, so 5 slots: 09–11, 11–13, 13–15, 15–17, 17–19.
 * The actual slot grid now comes from lib/scheduling/day-availability
 * (getDaySlots); this constant is only the fixed slot length used by
 * CalendarSlotPicker's UI labels ("09:00 — 11:00").
 */
export const SLOT_HOURS = 2;
