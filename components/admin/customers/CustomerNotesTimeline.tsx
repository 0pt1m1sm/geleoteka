"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { addCustomerNote, deleteCustomerNote } from "@/app/actions/customers";
import { useFormAction } from "@/lib/use-form-action";
import { confirm } from "@/lib/ui/confirm";

export interface TimelineNote {
  id: string;
  body: string;
  createdAt: Date;
  authorUserId: string | null;
  authorName: string | null;
}

interface Props {
  customerUserId: string;
  sessionUserId: string;
  sessionRole: string;
  notes: TimelineNote[];
}

function formatStamp(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CustomerNotesTimeline({
  customerUserId,
  sessionUserId,
  sessionRole,
  notes,
}: Props): React.ReactElement {
  const router = useRouter();
  const [body, setBody] = useState("");
  const { pending, error, runAction } = useFormAction();
  const isAdmin = sessionRole === "ADMIN";

  function submit(): void {
    runAction(async () => {
      const trimmed = body.trim();
      if (trimmed.length === 0) {
        throw new Error("Заметка не может быть пустой");
      }
      const fd = new FormData();
      fd.set("body", trimmed);
      const res = await addCustomerNote(customerUserId, null, fd);
      if (!res.ok) throw new Error(res.error);
      setBody("");
      router.refresh();
    });
  }

  async function remove(noteId: string): Promise<void> {
    if (!(await confirm({ message: "Удалить заметку?", danger: true }))) return;
    runAction(async () => {
      const res = await deleteCustomerNote(noteId);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Заметки</h2>

      <div className="card space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Markdown поддерживается. Например: **Звонок 14:30** — переносим запись"
          className="input min-h-[80px] resize-y"
          maxLength={4000}
        />
        {error ? <div className="alert alert-error">{error}</div> : null}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--foreground-muted)]">
            {body.trim().length}/4000
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending || body.trim().length === 0}
            className="btn btn-primary text-sm"
          >
            {pending ? "Добавление..." : "Добавить"}
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Заметок пока нет.</p>
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => {
            const canDelete = isAdmin || note.authorUserId === sessionUserId;
            return (
              <li key={note.id} className="card">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {note.authorName ?? "Неизвестный автор"} · {formatStamp(note.createdAt)}
                  </p>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => remove(note.id)}
                      disabled={pending}
                      className="text-xs text-[var(--color-error)] hover:underline"
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
                <div className="prose prose-sm max-w-none [&_p]:my-1 [&_*]:!text-[var(--foreground)]">
                  <ReactMarkdown>{note.body}</ReactMarkdown>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
