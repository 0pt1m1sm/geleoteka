import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { startOfDay, endOfDay, parseISO } from "date-fns";
import { WORK_HOURS } from "@/lib/booking-slots";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date parameter required" }, { status: 400 });
  }

  const date = parseISO(dateParam);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const reservedSlots = await db.slot.findMany({
    where: { dateTime: { gte: dayStart, lte: dayEnd } },
    select: { dateTime: true },
  });

  const bookedTimes = new Set(
    reservedSlots.map((s: { dateTime: Date }) => {
      const h = s.dateTime.getHours().toString().padStart(2, "0");
      const m = s.dateTime.getMinutes().toString().padStart(2, "0");
      return `${h}:${m}`;
    })
  );

  const now = new Date();
  const isToday = dayStart.getTime() === startOfDay(now).getTime();

  const slots = WORK_HOURS.map((time) => ({
    time,
    available:
      !bookedTimes.has(time) &&
      (!isToday || parseInt(time.split(":")[0]) > now.getHours()),
  }));

  return NextResponse.json({ slots });
}
