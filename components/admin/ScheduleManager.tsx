"use client";

import { useActionState, useState } from "react";

import { Alert, Button, Input } from "@/components/ui";
import {
  deleteBlockedInterval,
  deleteScheduleException,
  saveBlockedInterval,
  saveScheduleException,
  saveWeeklySchedule,
  type ScheduleResult,
} from "@/app/actions/schedule";
import { minutesToLabel } from "@/lib/scheduling/availability";

/** 0 = Sunday, matching JS getDay() and the WorkingHours primary key. */
const WEEKDAYS: ReadonlyArray<{ day: number; label: string }> = [
  { day: 1, label: "Понедельник" },
  { day: 2, label: "Вторник" },
  { day: 3, label: "Среда" },
  { day: 4, label: "Четверг" },
  { day: 5, label: "Пятница" },
  { day: 6, label: "Суббота" },
  { day: 0, label: "Воскресенье" },
];

/** Shop default when a weekday has no row yet: Пн–Пт 10–20, Сб 10–16, Вс закрыто. */
function defaultRow(day: number): WorkingHoursRow {
  if (day === 0) return { dayOfWeek: 0, isOpen: false, openMinute: 600, closeMinute: 1200 };
  if (day === 6) return { dayOfWeek: 6, isOpen: true, openMinute: 600, closeMinute: 960 };
  return { dayOfWeek: day, isOpen: true, openMinute: 600, closeMinute: 1200 };
}

export interface WorkingHoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  openMinute: number;
  closeMinute: number;
}

export interface ExceptionRow {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  isClosed: boolean;
  openMinute: number | null;
  closeMinute: number | null;
  reason: string | null;
}

export interface BlockedRow {
  id: string;
  /** Business-local "YYYY-MM-DDTHH:mm", ready for a datetime-local input. */
  startAt: string;
  endAt: string;
  reason: string | null;
}

interface Props {
  weekly: WorkingHoursRow[];
  exceptions: ExceptionRow[];
  blocked: BlockedRow[];
}

function Feedback({ state }: { state: ScheduleResult | null }): React.ReactElement | null {
  if (!state) return null;
  if (state.error) return <Alert variant="error">{state.error}</Alert>;
  if (state.warning) return <Alert variant="warning">{state.warning}</Alert>;
  if (state.success) {
    return <span className="text-xs text-[var(--color-success)]">Сохранено</span>;
  }
  return null;
}

/**
 * The whole week in one form with one Save — a shop changes its hours, not its
 * Tuesday, and seven separate save buttons made a single decision look like
 * seven. Each row is a plain grid line so the columns stay aligned and the
 * times read as a schedule rather than as fourteen unrelated inputs.
 */
function WeekEditor({ byDay }: { byDay: Map<number, WorkingHoursRow> }): React.ReactElement {
  const [state, formAction, isPending] = useActionState(saveWeeklySchedule, null);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-[minmax(7rem,1fr)_auto_auto_auto] gap-x-3 gap-y-1 items-center">
        <span className="text-xs text-[var(--foreground-muted)]">День</span>
        <span className="text-xs text-[var(--foreground-muted)] justify-self-center">Работаем</span>
        <span className="text-xs text-[var(--foreground-muted)]">С</span>
        <span className="text-xs text-[var(--foreground-muted)]">До</span>

        {WEEKDAYS.map(({ day, label }) => {
          const row = byDay.get(day) ?? defaultRow(day);
          return (
            <WeekdayRow key={day} day={day} label={label} row={row} />
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          {isPending ? "Сохранение..." : "Сохранить"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function WeekdayRow({
  day,
  label,
  row,
}: {
  day: number;
  label: string;
  row: WorkingHoursRow;
}): React.ReactElement {
  // Closed days keep their times in the DOM (just dimmed), so ticking the box
  // back on restores the hours the shop used to keep instead of blanking them.
  const [isOpen, setIsOpen] = useState(row.isOpen);

  return (
    <>
      <label htmlFor={`open-${day}`} className="text-sm py-1.5">
        {label}
      </label>
      <input
        id={`open-${day}`}
        type="checkbox"
        name={`isOpen-${day}`}
        checked={isOpen}
        onChange={(e) => setIsOpen(e.target.checked)}
        className="justify-self-center"
      />
      <input
        type="time"
        name={`openTime-${day}`}
        defaultValue={minutesToLabel(row.openMinute)}
        disabled={!isOpen}
        className="input w-28 disabled:opacity-40"
        aria-label={`${label}: время открытия`}
      />
      <input
        type="time"
        name={`closeTime-${day}`}
        defaultValue={minutesToLabel(row.closeMinute)}
        disabled={!isOpen}
        className="input w-28 disabled:opacity-40"
        aria-label={`${label}: время закрытия`}
      />
    </>
  );
}

function ExceptionForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(saveScheduleException, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Input label="Дата" name="date" type="date" required className="w-44" />
      <label className="flex items-center gap-2 text-sm pb-2">
        <input type="checkbox" name="isClosed" defaultChecked />
        Выходной
      </label>
      <Input label="С" name="openTime" type="time" className="w-28" />
      <Input label="До" name="closeTime" type="time" className="w-28" />
      <Input label="Причина" name="reason" placeholder="Праздник" className="w-48" />
      <Button type="submit" isLoading={isPending} disabled={isPending}>
        Добавить
      </Button>
      <Feedback state={state} />
    </form>
  );
}

function BlockedForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(saveBlockedInterval, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Input label="Начало" name="startAt" type="datetime-local" required className="w-56" />
      <Input label="Конец" name="endAt" type="datetime-local" required className="w-56" />
      <Input label="Причина" name="reason" placeholder="Обслуживание" className="w-48" />
      <Button type="submit" isLoading={isPending} disabled={isPending}>
        Заблокировать
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * Schedule editing for the admin calendar: weekly hours, exception days and
 * blocked intervals — the three things that decide what the booking form
 * offers.
 */
export function ScheduleManager({ weekly, exceptions, blocked }: Props): React.ReactElement {
  const byDay = new Map(weekly.map((w) => [w.dayOfWeek, w]));

  return (
    <div className="space-y-4">
      <details className="card group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
          <span className="text-lg font-semibold">Часы работы</span>
          <span className="text-xs text-[var(--foreground-muted)]">
            Определяют сетку записи на сайте
          </span>
        </summary>
        <div className="mt-4">
          <WeekEditor byDay={byDay} />
        </div>
      </details>

      <details className="card group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
          <span className="text-lg font-semibold">Праздники и особые дни</span>
          <span className="text-xs text-[var(--foreground-muted)]">
            {exceptions.length > 0 ? `${exceptions.length} в списке` : "Нет"}
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          <ExceptionForm />
          {exceptions.length > 0 ? (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {exceptions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <strong>{e.date}</strong>{" "}
                    {e.isClosed
                      ? "— выходной"
                      : `— ${e.openMinute !== null ? minutesToLabel(e.openMinute) : "?"}–${
                          e.closeMinute !== null ? minutesToLabel(e.closeMinute) : "?"
                        }`}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </span>
                  <form action={deleteScheduleException.bind(null, e.id)}>
                    <Button type="submit" variant="secondary">
                      Удалить
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      <details className="card group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 select-none">
          <span className="text-lg font-semibold">Блокировка времени</span>
          <span className="text-xs text-[var(--foreground-muted)]">
            {blocked.length > 0 ? `${blocked.length} интервалов` : "Нет"}
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          <BlockedForm />
          <p className="text-xs text-[var(--foreground-muted)]">
            Блокировка закрывает время для НОВЫХ записей. Уже существующие записи остаются —
            их нужно перенести вручную.
          </p>
          {blocked.length > 0 ? (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {b.startAt.replace("T", " ")} — {b.endAt.replace("T", " ")}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                  <form action={deleteBlockedInterval.bind(null, b.id)}>
                    <Button type="submit" variant="secondary">
                      Снять
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}
