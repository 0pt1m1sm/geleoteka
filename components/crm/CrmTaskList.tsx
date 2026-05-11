"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Plus, RotateCcw, X } from "lucide-react";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import {
  cancelCrmTask,
  completeCrmTask,
  createCrmTask,
  reopenCrmTask,
} from "@/app/actions/crm/tasks";
import {
  CRM_TASK_KIND_LABELS,
  CRM_TASK_STATUS_LABELS,
} from "@/lib/crm-labels";
import { formatDateTime } from "@/lib/utils";

interface TaskView {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  dueAt: Date;
  completedAt: Date | null;
  owner: { id: string; name: string };
  customer: { id: string; name: string } | null;
  deal: { id: string; number: string | null } | null;
}

interface Props {
  tasks: TaskView[];
  /** Reference timestamp for "overdue" comparison. Pass `Date.now()` from
   *  the calling server component so render is pure. */
  nowMs: number;
  /** When set, "New task" form pre-fills these and the customer is hidden. */
  customerUserId?: string;
  dealId?: string;
  /** When false, hide create button — read-only list (e.g. dashboard preview). */
  canCreate?: boolean;
  /** When true, render customer/deal back-links per row (for the /admin/crm/tasks page). */
  showLinks?: boolean;
  emptyText?: string;
}

const KIND_OPTIONS = Object.keys(CRM_TASK_KIND_LABELS);

export function CrmTaskList({
  tasks,
  nowMs,
  customerUserId,
  dealId,
  canCreate = true,
  showLinks = false,
  emptyText = "Задач нет.",
}: Props): React.ReactElement {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">Задачи</h3>
        {canCreate && !showForm ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setShowForm(true)}
          >
            Новая задача
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <TaskForm
          customerUserId={customerUserId}
          dealId={dealId}
          onCancel={() => setShowForm(false)}
          onCreated={() => setShowForm(false)}
        />
      ) : null}

      {tasks.length === 0 && !showForm ? (
        <p className="text-sm text-[var(--foreground-muted)]">{emptyText}</p>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} nowMs={nowMs} showLinks={showLinks} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function defaultDueAtLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TaskForm({
  customerUserId,
  dealId,
  onCancel,
  onCreated,
}: {
  customerUserId?: string;
  dealId?: string;
  onCancel: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createCrmTask, null);

  // React 19 forbids triggering parent setState during render — moved
  // to an effect so the onCreated callback and router.refresh fire
  // after the action result lands.
  useEffect(() => {
    if (state?.id && !state?.error && !isPending) {
      onCreated();
      router.refresh();
    }
  }, [state, isPending, onCreated, router]);

  return (
    <form action={formAction} className="card space-y-3">
      {customerUserId ? (
        <input type="hidden" name="customerUserId" value={customerUserId} />
      ) : null}
      {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}

      <Input
        label="Заголовок"
        name="title"
        required
        placeholder="Перезвонить через 3 дня после ТО"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Срок"
          name="dueAt"
          type="datetime-local"
          defaultValue={defaultDueAtLocal()}
          required
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="task-kind">
            Тип
          </label>
          <select
            id="task-kind"
            name="kind"
            defaultValue="GENERIC"
            className="input text-sm"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {CRM_TASK_KIND_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Textarea
        label="Заметка (опционально)"
        name="body"
        rows={2}
        placeholder="Детали или контекст"
      />

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          Отмена
        </Button>
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          Создать
        </Button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  nowMs,
  showLinks,
}: {
  task: TaskView;
  nowMs: number;
  showLinks: boolean;
}): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null }>): void {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const isOverdue = task.status === "OPEN" && task.dueAt.getTime() < nowMs;
  const isOpen = task.status === "OPEN";

  return (
    <li className="py-3 flex items-start gap-3">
      <button
        type="button"
        onClick={() => {
          if (isOpen) run(() => completeCrmTask(task.id));
          else run(() => reopenCrmTask(task.id));
        }}
        disabled={pending}
        className="mt-0.5 shrink-0"
        aria-label={isOpen ? "Отметить выполненной" : "Открыть задачу заново"}
      >
        {isOpen ? (
          <span className="inline-block w-4 h-4 rounded-full border-2 border-[var(--border-hover)] hover:border-[var(--color-accent)]" />
        ) : (
          <CheckCircle2 size={18} className="text-[var(--color-success)]" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium ${
            task.status === "DONE" ? "line-through text-[var(--foreground-muted)]" : ""
          }`}
        >
          {task.title}
        </div>
        <div className="text-xs text-[var(--foreground-muted)] mt-0.5 flex flex-wrap gap-x-3">
          <span>{CRM_TASK_KIND_LABELS[task.kind] ?? task.kind}</span>
          <span className={isOverdue ? "text-[var(--color-error)] font-medium" : ""}>
            {isOverdue ? "Просрочена · " : ""}
            {formatDateTime(task.dueAt)}
          </span>
          <span>{task.owner.name}</span>
          {task.status !== "OPEN" ? (
            <span>{CRM_TASK_STATUS_LABELS[task.status] ?? task.status}</span>
          ) : null}
        </div>
        {task.body ? (
          <p className="mt-1 text-sm text-[var(--foreground-muted)] whitespace-pre-wrap">
            {task.body}
          </p>
        ) : null}
        {showLinks ? (
          <div className="mt-1 text-xs flex flex-wrap gap-x-3 text-[var(--foreground-muted)]">
            {task.customer ? (
              <Link
                href={`/admin/customers/${task.customer.id}`}
                className="hover:text-[var(--color-accent)]"
              >
                Клиент: {task.customer.name}
              </Link>
            ) : null}
            {task.deal ? (
              <Link
                href={`/admin/crm/deals/${task.deal.id}`}
                className="hover:text-[var(--color-accent)]"
              >
                Сделка: {task.deal.number ?? "—"}
              </Link>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="text-xs text-[var(--color-error)] mt-1">{error}</div>
        ) : null}
      </div>

      {isOpen ? (
        <button
          type="button"
          onClick={() => run(() => cancelCrmTask(task.id))}
          disabled={pending}
          className="btn-icon shrink-0"
          aria-label="Отменить задачу"
          title="Отменить"
        >
          <X size={14} />
        </button>
      ) : task.status === "CANCELLED" ? (
        <button
          type="button"
          onClick={() => run(() => reopenCrmTask(task.id))}
          disabled={pending}
          className="btn-icon shrink-0"
          aria-label="Восстановить"
          title="Восстановить"
        >
          <RotateCcw size={14} />
        </button>
      ) : null}
    </li>
  );
}
