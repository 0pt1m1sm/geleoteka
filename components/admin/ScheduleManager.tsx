"use client";

import { useActionState } from "react";

import { Alert, Button, Input } from "@/components/ui";
import {
  deleteBlockedInterval,
  deleteScheduleException,
  saveBlockedInterval,
  saveScheduleException,
  saveWorkingHours,
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

function WeekdayRow({ row, label }: { row: WorkingHoursRow; label: string }): React.ReactElement {
  const [state, formAction, isPending] = useActionState(saveWorkingHours, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 py-3">
      <input type="hidden" name="dayOfWeek" value={row.dayOfWeek} />
      <span className="w-32 text-sm">{label}</span>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isOpen" defaultChecked={row.isOpen} />
        Работаем
      </label>

      <Input
        label="С"
        name="openTime"
        type="time"
        defaultValue={minutesToLabel(row.openMinute)}
        className="w-28"
      />
      <Input
        label="До"
        name="closeTime"
        type="time"
        defaultValue={minutesToLabel(row.closeMinute)}
        className="w-28"
      />

      <Button type="submit" variant="secondary" isLoading={isPending} disabled={isPending}>
        Сохранить
      </Button>
      <Feedback state={state} />
    </form>
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
 * blocked intervals. Each weekday saves independently so two managers editing
 * different days cannot overwrite one another.
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
        <div className="mt-2 divide-y divide-[var(--border)]">
          {WEEKDAYS.map(({ day, label }) => (
            <WeekdayRow
              key={day}
              label={label}
              row={
                byDay.get(day) ?? {
                  dayOfWeek: day,
                  isOpen: day >= 1 && day <= 5,
                  openMinute: 9 * 60,
                  closeMinute: 19 * 60,
                }
              }
            />
          ))}
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
