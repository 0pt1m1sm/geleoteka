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
import { CustomerSearchCombobox } from "@/components/admin/inbox/CustomerSearchCombobox";
import { DEAL_STAGE_LABELS } from "@/lib/deal-stage-labels";
import { formatPrice } from "@/lib/utils";
import {
  CRM_TASK_KIND_LABELS,
  CRM_TASK_STATUS_LABELS,
} from "@/lib/crm-labels";
import { toast } from "@/lib/ui/toast";
import { confirm } from "@/lib/ui/confirm";
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

interface DealOption {
  id: string;
  number: string | null;
  stage: string;
  total: number;
}

interface PickedCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
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

  // When the form is opened from a customer page or deal page, customer/deal
  // come in as fixed props (hidden inputs). When opened from the standalone
  // /admin/crm/tasks page they're both undefined — the manager picks them
  // here. Picked state lives outside the form so re-render keeps selection.
  const isContextBound = Boolean(customerUserId);
  const [pickedCustomer, setPickedCustomer] = useState<PickedCustomer | null>(null);
  const [pickedDealId, setPickedDealId] = useState<string>(dealId ?? "");
  const [dealOptions, setDealOptions] = useState<DealOption[]>([]);

  const effectiveCustomerId = customerUserId ?? pickedCustomer?.id ?? "";
  const effectiveDealId = dealId ?? pickedDealId ?? "";

  // Load deals for the picked customer (only when not context-bound).
  // Reset on customer-change is done in clearCustomer below, not here —
  // putting setState in the effect body trips React 19's purity rule.
  useEffect(() => {
    if (isContextBound || !pickedCustomer) return;
    const controller = new AbortController();
    fetch(`/api/admin/customers/${pickedCustomer.id}/deals`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        setDealOptions(Array.isArray(data?.deals) ? data.deals : []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isContextBound, pickedCustomer]);

  function clearCustomer(): void {
    setPickedCustomer(null);
    setDealOptions([]);
    setPickedDealId("");
  }

  function selectCustomer(c: PickedCustomer): void {
    setPickedCustomer(c);
    setDealOptions([]);
    setPickedDealId("");
  }

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
      <input type="hidden" name="customerUserId" value={effectiveCustomerId} />
      <input type="hidden" name="dealId" value={effectiveDealId} />

      {!isContextBound ? (
        <div className="space-y-2">
          <label className="text-sm font-medium block">Клиент</label>
          {pickedCustomer ? (
            <div className="flex items-center justify-between gap-3 border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{pickedCustomer.name}</div>
                <div className="text-xs text-[var(--foreground-muted)] truncate">
                  {pickedCustomer.email} · {pickedCustomer.phone}
                </div>
              </div>
              <button
                type="button"
                onClick={clearCustomer}
                className="btn-icon shrink-0"
                aria-label="Сбросить клиента"
                title="Сменить клиента"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <CustomerSearchCombobox
              onSelect={selectCustomer}
              placeholder="Имя, email или телефон клиента"
            />
          )}
        </div>
      ) : null}

      {!isContextBound && pickedCustomer && dealOptions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="task-deal">
            Сделка (опционально)
          </label>
          <select
            id="task-deal"
            value={pickedDealId}
            onChange={(e) => setPickedDealId(e.target.value)}
            className="input text-sm"
          >
            <option value="">— без привязки —</option>
            {dealOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number ?? "—"} · {DEAL_STAGE_LABELS[d.stage] ?? d.stage}
                {d.total ? ` · ${formatPrice(d.total)}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
        <Button
          type="submit"
          isLoading={isPending}
          disabled={isPending || (!isContextBound && !pickedCustomer)}
          title={
            !isContextBound && !pickedCustomer ? "Выберите клиента" : undefined
          }
        >
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
  // Optimistic local override for the checkbox so the user sees the check
  // and strikethrough animate in immediately, before the server confirms.
  // Reverts on error.
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);

  function run(
    action: () => Promise<{ error: string | null }>,
    successToast?: string,
  ): void {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        setError(res.error);
        setOptimisticDone(null);
        toast.error(res.error);
        return;
      }
      if (successToast) toast.success(successToast);
      router.refresh();
    });
  }

  const isOverdue = task.status === "OPEN" && task.dueAt.getTime() < nowMs;
  const isOpenRaw = task.status === "OPEN";
  // Apply optimistic toggle on top of server-truth status.
  const isOpen = optimisticDone === null ? isOpenRaw : !optimisticDone;
  const showDoneStyling = !isOpen;

  function handleToggle(): void {
    if (isOpenRaw) {
      setOptimisticDone(true);
      run(() => completeCrmTask(task.id));
    } else {
      setOptimisticDone(false);
      run(() => reopenCrmTask(task.id));
    }
  }

  return (
    <li
      className="py-3 flex items-start gap-3 transition-opacity duration-300"
      data-done={showDoneStyling || undefined}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className="mt-0.5 shrink-0 relative"
        aria-label={isOpen ? "Отметить выполненной" : "Открыть задачу заново"}
        aria-pressed={!isOpen}
      >
        <span
          className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 transition-all duration-300 ${
            isOpen
              ? "border-[var(--border-hover)] hover:border-[var(--color-accent)] bg-transparent"
              : "border-[var(--color-success,#22c55e)] bg-[var(--color-success,#22c55e)] scale-110"
          }`}
        >
          <CheckCircle2
            size={14}
            className={`text-white transition-opacity duration-300 ${
              isOpen ? "opacity-0" : "opacity-100"
            }`}
            strokeWidth={3}
            aria-hidden
          />
        </span>
      </button>

      <TaskBodyLink task={task} showLinks={showLinks}>
        <div
          className={`text-sm font-medium transition-all duration-300 ${
            showDoneStyling ? "line-through text-[var(--foreground-muted)] opacity-70" : ""
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
        {showLinks && (task.customer || task.deal) ? (
          <div className="mt-1 text-xs flex flex-wrap gap-x-3 text-[var(--foreground-muted)]">
            {task.customer ? <span>Клиент: {task.customer.name}</span> : null}
            {task.deal ? <span>Сделка: {task.deal.number ?? "—"}</span> : null}
          </div>
        ) : null}
        {error ? (
          <div className="text-xs text-[var(--color-error)] mt-1">{error}</div>
        ) : null}
      </TaskBodyLink>

      {isOpen ? (
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              message: "Отменить задачу?",
              danger: true,
              confirmText: "Отменить задачу",
              cancelText: "Не отменять",
            });
            if (!ok) return;
            run(() => cancelCrmTask(task.id), "Задача отменена");
          }}
          disabled={pending}
          data-loading={pending || undefined}
          aria-busy={pending || undefined}
          className="btn-icon shrink-0"
          aria-label="Отменить задачу"
          title="Отменить"
        >
          <X size={14} />
        </button>
      ) : task.status === "CANCELLED" ? (
        <button
          type="button"
          onClick={() => run(() => reopenCrmTask(task.id), "Задача восстановлена")}
          disabled={pending}
          data-loading={pending || undefined}
          aria-busy={pending || undefined}
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

/**
 * Wraps the task title/meta/body in a Link to the deal (or customer
 * fallback) so the entire row content is a tap target — not just the
 * checkbox. Falls back to a plain div when neither deal nor customer
 * is set, so unlinked tasks still render but aren't navigable.
 */
function TaskBodyLink({
  task,
  showLinks,
  children,
}: {
  task: TaskView;
  showLinks: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const target = task.deal
    ? `/admin/crm/deals/${task.deal.id}`
    : task.customer
      ? `/admin/customers/${task.customer.id}`
      : null;

  if (!target) {
    return <div className="flex-1 min-w-0">{children}</div>;
  }
  return (
    <Link
      href={target}
      className="row-clickable flex-1 min-w-0 -mx-2 px-2 py-1 rounded"
      aria-label={
        showLinks && task.deal
          ? `Открыть сделку ${task.deal.number ?? ""}`.trim()
          : showLinks && task.customer
            ? `Открыть карточку клиента ${task.customer.name}`
            : "Открыть"
      }
    >
      {children}
    </Link>
  );
}
