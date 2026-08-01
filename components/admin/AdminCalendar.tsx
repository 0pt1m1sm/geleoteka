"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";
import { toggleSlotBlock } from "@/app/actions/schedule";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";
import {
  computeDaySlots,
  labelToMinutes,
  minutesToLabel,
  SLOT_MINUTES,
  type DayException,
  type WeeklyHours,
} from "@/lib/scheduling/availability";

interface CalendarRepairOrder {
  id: string;
  /** Shop-local calendar day, "YYYY-MM-DD". */
  date: string;
  /** Shop-local minutes from midnight. */
  minute: number;
  time: string;
  status: string;
  clientName: string;
  clientPhone: string;
  vehicleModel: string;
  masterName: string | null;
  /** Null only for legacy/non-calendar RepairOrders that have no Slot. */
  bayId: string | null;
  bayName: string | null;
  jobs: string[];
}

interface CalendarBlock {
  id: string;
  /** Shop-local "YYYY-MM-DDTHH:mm". */
  startAt: string;
  endAt: string;
  reason: string | null;
}

interface ExceptionRow {
  date: string;
  isClosed: boolean;
  openMinute: number | null;
  closeMinute: number | null;
  reason: string | null;
}

interface Props {
  repairOrders: CalendarRepairOrder[];
  weekly: WeeklyHours[];
  exceptions: ExceptionRow[];
  blocked: CalendarBlock[];
  /** Today in shop-local time, "YYYY-MM-DD". */
  today: string;
  /** Active physical resources; their count and identity define capacity. */
  activeBayIds: string[];
}

/** Shift a "YYYY-MM-DD" by whole days without touching the browser timezone. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** Clip a block to one day, in shop-local minutes. Null when it misses the day. */
function blockRangeOn(block: CalendarBlock, date: string): { start: number; end: number } | null {
  const [startDate, startTime] = block.startAt.split("T");
  const [endDate, endTime] = block.endAt.split("T");
  if (endDate < date || startDate > date) return null;
  return {
    start: startDate === date ? labelToMinutes(startTime) ?? 0 : 0,
    end: endDate === date ? labelToMinutes(endTime) ?? 24 * 60 : 24 * 60,
  };
}

/**
 * The day's slot grid — the same view the customer sees when booking, which is
 * the point: an agenda list showed what was booked but gave no hint that an
 * hour was blocked or that the shop was shut. Here every slot is visible and
 * says why it is not free.
 */
export function AdminCalendar({
  repairOrders,
  weekly,
  exceptions,
  blocked,
  today,
  activeBayIds,
}: Props): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(today);

  /**
   * Клик по слоту закрывает или открывает его. Отдельной секции с двумя полями
   * даты больше нет: слот уже нарисован и знает свои границы, набирать их
   * вручную незачем.
   */
  async function toggleBlock(minute: number, label: string, isBlocked: boolean): Promise<void> {
    if (isBlocked) {
      const ok = await confirm({
        title: "Снять блокировку",
        message: `Открыть ${label} для записи?`,
        confirmText: "Открыть",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: "Заблокировать слот",
        message: `Закрыть ${label}? В это время нельзя будет записаться.`,
        danger: true,
        confirmText: "Заблокировать",
      });
      if (!ok) return;
    }
    // Причина не обязательна — спрашиваем только при блокировке и не мешаем
    // отказом, если её не ввели: чаще всего важен сам факт закрытия.
    const reason = isBlocked ? null : (window.prompt("Причина (необязательно):") ?? null);

    startTransition(async () => {
      const result = await toggleSlotBlock(selected, minute, SLOT_MINUTES, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.blocked ? "Слот заблокирован" : "Слот открыт");
      router.refresh();
    });
  }

  const days = Array.from({ length: 14 }, (_, i) => shiftDate(today, i - 3));

  const exception = exceptions.find((e) => e.date === selected) ?? null;
  const dayOrders = repairOrders.filter((o) => o.date === selected);
  const dayBlocks = blocked
    .map((b) => ({ block: b, range: blockRangeOn(b, selected) }))
    .filter((x): x is { block: CalendarBlock; range: { start: number; end: number } } =>
      x.range !== null,
    );

  const slots = computeDaySlots({
    dayOfWeek: weekdayOf(selected),
    weekly,
    exception: exception
      ? ({
          isClosed: exception.isClosed,
          openMinute: exception.openMinute,
          closeMinute: exception.closeMinute,
        } satisfies DayException)
      : null,
    activeBayIds,
    booked: dayOrders.flatMap((order) =>
      order.bayId ? [{ startMinute: order.minute, bayId: order.bayId }] : [],
    ),
    blocked: dayBlocks.map((x) => ({ startMinute: x.range.start, endMinute: x.range.end })),
    // Past slots stay visible to staff: yesterday's schedule is still a record.
    nowMinute: null,
  });

  // A booking can sit outside the current grid — the shop shortened its hours,
  // or a manager moved it deliberately. It must never disappear from the day.
  const gridMinutes = new Set(slots.map((s) => labelToMinutes(s.time)));
  const offGrid = dayOrders.filter((o) => !gridMinutes.has(o.minute));

  // Запись занимает два часа, а не мгновение. Пересечение по интервалу для
  // блокировок здесь считалось и раньше — для записей его просто не применяли,
  // поэтому слот 14:00—16:00 показывался свободным, когда его половину уже
  // занимала запись, начатая в 13:00.
  interface DayRow {
    key: string;
    minute: number;
    label: string;
    orders: typeof dayOrders;
    blockReason: string | null;
    note?: string;
    busyNote?: string;
  }

  const gridRows: DayRow[] = slots.map((slot) => {
    const minute = labelToMinutes(slot.time) ?? 0;
    const orders = dayOrders.filter((order) => order.minute === minute);
    const block = dayBlocks.find(
      (x) => x.range.start < minute + SLOT_MINUTES && x.range.end > minute,
    );
    return {
      key: slot.time,
      minute,
      label: `${slot.time} — ${minutesToLabel(minute + SLOT_MINUTES)}`,
      orders,
      blockReason: block ? block.block.reason ?? "заблокировано" : null,
      busyNote:
        !slot.available && !block && orders.length === 0
          ? "Все активные посты заняты пересекающимися записями"
          : undefined,
    };
  });

  // Записи вне сетки раньше дописывались в конец списка, из-за чего 13:00
  // оказывалась ниже 14:00. День читается по времени, а не по происхождению
  // записи, поэтому строки идут одним отсортированным списком.
  const rows: DayRow[] = [
    ...gridRows,
    ...offGrid.map((order) => ({
      key: order.id,
      minute: order.minute,
      label: `${order.time} — ${minutesToLabel(order.minute + SLOT_MINUTES)}`,
      orders: [order],
      blockReason: null,
      note: "вне графика",
    })),
  ].sort((a, b) => a.minute - b.minute);

  // Свободным считается слот, который никем не накрыт, — иначе счётчик обещает
  // ёмкость, которой нет.
  const freeCount = slots.filter((slot) => slot.available).length;

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {days.map((day) => {
          const isSelected = day === selected;
          const count = repairOrders.filter((o) => o.date === day).length;
          const closed = computeDaySlots({
            dayOfWeek: weekdayOf(day),
            weekly,
            exception: exceptions.find((e) => e.date === day) ?? null,
            activeBayIds,
            booked: [],
          }).length === 0;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelected(day)}
              className={`flex flex-col items-center px-4 py-2 rounded-lg shrink-0 min-w-[70px] transition-colors ${
                isSelected
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)]"
              }`}
            >
              <span className="text-[10px] uppercase">
                {format(parseISO(day), "EEE", { locale: ru })}
              </span>
              <span className="text-lg font-bold">{format(parseISO(day), "d")}</span>
              <span
                className={`text-[10px] ${
                  isSelected ? "text-white/80" : "text-[var(--foreground-muted)]"
                }`}
              >
                {closed ? "выходной" : count > 0 ? `${count} зап.` : " "}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <h3 className="font-medium mb-1">
          {format(parseISO(selected), "d MMMM, EEEE", { locale: ru })}
        </h3>
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          {slots.length === 0
            ? exception?.isClosed
              ? `Закрыто${exception.reason ? ` — ${exception.reason}` : ""}`
              : "Нерабочий день по графику"
            : `${dayOrders.length} записей · ${freeCount} свободно из ${slots.length} · активных постов: ${activeBayIds.length}`}
        </p>

        {slots.length === 0 && offGrid.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] py-2">
            Слотов нет. Часы работы и праздники настраиваются ниже.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <SlotRow
                key={row.key}
                label={row.label}
                orders={row.orders}
                blockReason={row.blockReason}
                note={row.note}
                busyNote={row.busyNote}
                onToggleBlock={
                  row.orders.length > 0 || row.busyNote
                    ? undefined
                    : () => void toggleBlock(row.minute, row.label, row.blockReason !== null)
                }
                pending={pending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotRow({
  label,
  orders,
  blockReason,
  note,
  busyNote,
  onToggleBlock,
  pending,
}: {
  label: string;
  orders: CalendarRepairOrder[];
  blockReason: string | null;
  note?: string;
  /** Слот накрыт чужой записью — свободным он не является. */
  busyNote?: string;
  /** Есть только у слотов, которыми можно управлять: свободных и заблокированных. */
  onToggleBlock?: () => void;
  pending?: boolean;
}): React.ReactElement {
  const tone = orders.length > 0
    ? "bg-[var(--background-secondary)]"
    : blockReason || busyNote
      ? "bg-[var(--background-secondary)] opacity-60"
      : "border border-dashed border-[var(--border)]";

  return (
    <div className={`group flex items-start gap-4 p-3 rounded-lg ${tone}`}>
      <div className="w-32 shrink-0 text-sm font-medium tabular-nums">{label}</div>

      {orders.length > 0 ? (
        <div className="flex-1 min-w-0 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/admin/repair-orders/${order.id}`}
              className="block min-w-0 hover:opacity-80"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-medium truncate">{order.clientName}</span>
                <span className={`badge text-[10px] status-${order.status.toLowerCase()}`}>
                  {REPAIR_ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
                {order.bayName ? <span className="badge text-[10px]">{order.bayName}</span> : null}
                {note ? (
                  <span className="badge text-[10px] bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                    {note}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-[var(--foreground-muted)]">
                {order.vehicleModel}
                {order.masterName ? ` · ${order.masterName}` : ""}
              </p>
              {order.jobs.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {order.jobs.map((job, index) => (
                    <span key={index} className="badge badge-silver text-[10px]">
                      {job}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      ) : busyNote ? (
        <div className="flex-1 text-sm text-[var(--foreground-muted)]">{busyNote}</div>
      ) : onToggleBlock ? (
        <button
          type="button"
          onClick={onToggleBlock}
          disabled={pending}
          className="flex-1 text-left text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          title={blockReason ? "Открыть слот для записи" : "Заблокировать слот"}
        >
          {blockReason ? `Заблокировано — ${blockReason}` : "Свободно"}
          <span className="block text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
            {blockReason ? "нажмите, чтобы открыть" : "нажмите, чтобы заблокировать"}
          </span>
        </button>
      ) : blockReason ? (
        <div className="flex-1 text-sm text-[var(--foreground-muted)]">
          Заблокировано — {blockReason}
        </div>
      ) : (
        <div className="flex-1 text-sm text-[var(--foreground-muted)]">Свободно</div>
      )}
    </div>
  );
}
