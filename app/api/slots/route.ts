import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getDaySlots } from "@/lib/scheduling/day-availability";

export const dynamic = "force-dynamic";

/**
 * Availability for one day, as `{ slots: [{ time, available }] }`.
 *
 * The response shape is unchanged — CalendarSlotPicker reads it directly — but
 * the slots now come from the editable schedule (working hours, holidays and
 * blocked intervals) instead of a hardcoded array, and a closed day correctly
 * returns an empty list rather than five phantom slots.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date parameter required" }, { status: 400 });
  }

  // The picker sends a plain calendar day; anything else is a client bug, and
  // parsing it loosely would silently shift the day across a timezone.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  if (Number.isNaN(new Date(`${dateParam}T00:00:00.000Z`).getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  try {
    const slots = await getDaySlots(dateParam);
    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[GET /api/slots]", err);
    return NextResponse.json({ error: "Не удалось получить доступные слоты" }, { status: 500 });
  }
}
