"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { FUEL_OPTIONS, type DraftRow } from "./types";

interface TrimEditorProps {
  draft: DraftRow;
  setDraft: (next: DraftRow) => void;
  onAdd: () => void;
  pending: boolean;
}

export function TrimEditor({
  draft,
  setDraft,
  onAdd,
  pending,
}: TrimEditorProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 rounded border border-dashed border-[var(--border)] p-2">
      <input
        type="text"
        value={draft.code}
        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
        className="input text-xs col-span-2 sm:col-span-1"
        placeholder="G 63 AMG"
        aria-label="Новый код"
      />
      <input
        type="text"
        value={draft.engineCode}
        onChange={(e) => setDraft({ ...draft, engineCode: e.target.value })}
        className="input text-xs font-mono"
        placeholder="M177"
        aria-label="Двигатель"
      />
      <input
        type="text"
        value={draft.drivetrain}
        onChange={(e) => setDraft({ ...draft, drivetrain: e.target.value })}
        className="input text-xs"
        placeholder="4MATIC"
        aria-label="Привод"
      />
      <input
        type="text"
        value={draft.bodyStyle}
        onChange={(e) => setDraft({ ...draft, bodyStyle: e.target.value })}
        className="input text-xs"
        placeholder="long"
        aria-label="Кузов"
      />
      <select
        value={draft.fuelType}
        onChange={(e) => setDraft({ ...draft, fuelType: e.target.value as DraftRow["fuelType"] })}
        className="input text-xs"
        aria-label="Топливо"
      >
        {FUEL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.1"
        value={draft.displacementL}
        onChange={(e) => setDraft({ ...draft, displacementL: e.target.value })}
        className="input text-xs"
        placeholder="4.0"
        aria-label="Объём (л)"
      />
      <input
        type="number"
        value={draft.horsepower}
        onChange={(e) => setDraft({ ...draft, horsepower: e.target.value })}
        className="input text-xs"
        placeholder="585"
        aria-label="Мощность"
      />
      <input
        type="text"
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        className="input text-xs col-span-2 sm:col-span-3 lg:col-span-5"
        placeholder="Заметки"
        aria-label="Заметки"
      />
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={pending}
        leftIcon={<Plus size={12} />}
        className="ml-auto col-span-2 lg:col-span-1"
      >
        Добавить
      </Button>
    </div>
  );
}
