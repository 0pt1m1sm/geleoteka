"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import {
  TAG_COLOR_PALETTE,
  getTagBadgeClass,
  type ColorSlug,
} from "@/lib/customer-tags";
import {
  assignCustomerTag,
  createCustomerTag,
  unassignCustomerTag,
} from "@/app/actions/customers";
import { useFormAction } from "@/lib/use-form-action";

export interface AssignedTag {
  id: string;
  name: string;
  colorSlug: string;
}

interface Props {
  customerUserId: string;
  assigned: AssignedTag[];
  availableTags: AssignedTag[];
}

export function CustomerTagsManager({
  customerUserId,
  assigned,
  availableTags,
}: Props): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, error, runAction, setError } = useFormAction();

  const assignedIds = useMemo(() => new Set(assigned.map((t) => t.id)), [assigned]);

  function handleUnassign(tagId: string): void {
    runAction(async () => {
      const res = await unassignCustomerTag(customerUserId, tagId);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    });
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">Тэги</h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
          <DialogTrigger asChild>
            <button type="button" className="btn btn-secondary text-sm">
              + Добавить тэг
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Тэги клиента</DialogTitle>
            </DialogHeader>
            <TagPicker
              customerUserId={customerUserId}
              assignedIds={assignedIds}
              availableTags={availableTags}
              onAssigned={() => router.refresh()}
            />
          </DialogContent>
        </Dialog>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {assigned.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Тэгов пока нет.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assigned.map((tag) => (
            <span
              key={tag.id}
              className={`badge text-xs inline-flex items-center gap-1 ${getTagBadgeClass(tag.colorSlug)}`}
            >
              {tag.name}
              <button
                type="button"
                aria-label={`Удалить тэг ${tag.name}`}
                onClick={() => handleUnassign(tag.id)}
                disabled={pending}
                className="ml-1 text-current opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

interface PickerProps {
  customerUserId: string;
  assignedIds: Set<string>;
  availableTags: AssignedTag[];
  onAssigned: () => void;
}

function TagPicker({
  customerUserId,
  assignedIds,
  availableTags,
  onAssigned,
}: PickerProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<ColorSlug>(TAG_COLOR_PALETTE[0].slug);
  const { pending, error, runAction, setError } = useFormAction();

  const matches = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    if (needle === "") return availableTags;
    return availableTags.filter((t) => t.name.toLocaleLowerCase("ru").includes(needle));
  }, [availableTags, search]);

  function handlePick(tagId: string): void {
    setError(null);
    runAction(async () => {
      const res = await assignCustomerTag(customerUserId, tagId);
      if (!res.ok) throw new Error(res.error);
      onAssigned();
    });
  }

  function handleCreate(): void {
    setError(null);
    runAction(async () => {
      const fd = new FormData();
      fd.set("name", newName);
      fd.set("colorSlug", newColor);
      const created = await createCustomerTag(null, fd);
      if (!created.ok) throw new Error(created.error);
      const assignRes = await assignCustomerTag(customerUserId, created.tagId);
      if (!assignRes.ok) throw new Error(assignRes.error);
      setNewName("");
      setCreating(false);
      onAssigned();
    });
  }

  return (
    <div className="space-y-3">
      {!creating ? (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск тэга"
            className="input"
            autoFocus
          />

          {error ? <div className="alert alert-error">{error}</div> : null}

          <ul className="max-h-[40vh] overflow-y-auto border border-[var(--border)] rounded-[var(--radius-md)] divide-y divide-[var(--border)]">
            {matches.length === 0 ? (
              <li className="p-3 text-sm text-[var(--foreground-muted)]">Совпадений нет.</li>
            ) : (
              matches.map((tag) => {
                const already = assignedIds.has(tag.id);
                return (
                  <li key={tag.id} className="flex items-center justify-between gap-3 p-3">
                    <span className={`badge text-xs ${getTagBadgeClass(tag.colorSlug)}`}>
                      {tag.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePick(tag.id)}
                      disabled={pending || already}
                      className="text-sm hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      {already ? "Уже добавлен" : "Добавить"}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <button
            type="button"
            onClick={() => { setCreating(true); setError(null); }}
            className="btn btn-secondary text-sm w-full"
          >
            + Создать новый тэг
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="new-tag-name" className="block text-sm font-medium mb-2">Название</label>
            <input
              id="new-tag-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={32}
              className="input"
              autoFocus
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium mb-2">Цвет</legend>
            <div className="grid grid-cols-4 gap-2">
              {TAG_COLOR_PALETTE.map((c) => (
                <label
                  key={c.slug}
                  className={`badge cursor-pointer text-xs justify-center ${getTagBadgeClass(c.slug)} ${newColor === c.slug ? "outline outline-2 outline-[var(--color-accent)]" : ""}`}
                >
                  <input
                    type="radio"
                    name="newColor"
                    value={c.slug}
                    checked={newColor === c.slug}
                    onChange={() => setNewColor(c.slug)}
                    className="sr-only"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <div className="flex gap-3 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => { setCreating(false); setError(null); }}
              className="btn btn-secondary text-sm"
              disabled={pending}
            >
              Отмена
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCreate}
              className="btn btn-primary text-sm"
              disabled={pending || newName.trim().length === 0}
            >
              {pending ? "Создание..." : "Создать и добавить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
