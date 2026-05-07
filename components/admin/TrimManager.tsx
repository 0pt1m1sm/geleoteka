"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTrim, updateTrim, deleteTrim } from "@/app/actions/vehicle-catalog";
import { Alert } from "@/components/ui";
import { TrimList } from "./trim-manager/TrimList";
import { TrimEditor } from "./trim-manager/TrimEditor";
import { TrimDeleteConfirm } from "./trim-manager/TrimDeleteConfirm";
import { EMPTY_DRAFT, type DraftRow, type TrimRow } from "./trim-manager/types";

interface Props {
  generationId: string;
  generationCode: string;
  trims: TrimRow[];
}

export function TrimManager({ generationId, generationCode, trims }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT);
  const [pendingDelete, setPendingDelete] = useState<TrimRow | null>(null);

  function handleAdd(): void {
    setError(null);
    const code = draft.code.trim();
    if (!code) {
      setError("Код варианта обязателен (например G 63 AMG)");
      return;
    }
    const horsepower = draft.horsepower.trim() === "" ? null : parseInt(draft.horsepower, 10);
    if (horsepower !== null && (!Number.isFinite(horsepower) || horsepower < 0)) {
      setError("Мощность должна быть положительным числом");
      return;
    }
    const displacement = draft.displacementL.trim() === "" ? null : draft.displacementL.trim();
    if (displacement !== null && !Number.isFinite(parseFloat(displacement))) {
      setError("Объём двигателя должен быть числом (например 4.0)");
      return;
    }

    startTransition(async () => {
      try {
        await createTrim({
          generationId,
          code,
          bodyStyle: draft.bodyStyle.trim() || null,
          drivetrain: draft.drivetrain.trim() || null,
          fuelType: draft.fuelType === "" ? null : draft.fuelType,
          engineCode: draft.engineCode.trim() || null,
          displacementL: displacement,
          horsepower,
          notes: draft.notes.trim() || null,
        });
        setDraft(EMPTY_DRAFT);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка создания варианта");
      }
    });
  }

  function handleFieldUpdate(
    id: string,
    field: keyof Omit<TrimRow, "id">,
    value: string | boolean | number | null,
  ): void {
    setError(null);
    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {};
        payload[field] = value;
        await updateTrim(id, payload as Parameters<typeof updateTrim>[1]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка обновления");
      }
    });
  }

  function handleDeleteConfirm(): void {
    const t = pendingDelete;
    if (!t) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteTrim(t.id);
        setPendingDelete(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка удаления");
      }
    });
  }

  return (
    <details className="rounded-lg border border-[var(--border)]/60 bg-[var(--background-secondary)]/40">
      <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
        + {trims.length > 0 ? `${trims.length} вариантов` : "Добавить варианты"} ({generationCode})
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-1">
        {error && <Alert variant="error">{error}</Alert>}
        <TrimList
          trims={trims}
          pending={pending}
          onFieldUpdate={handleFieldUpdate}
          onDeleteRequest={setPendingDelete}
        />
        <TrimEditor draft={draft} setDraft={setDraft} onAdd={handleAdd} pending={pending} />
      </div>
      <TrimDeleteConfirm
        trim={pendingDelete}
        pending={pending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </details>
  );
}
