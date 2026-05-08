"use client";

import { useEffect, useState } from "react";
import { updateCMSBlock } from "@/app/actions/cms";
import { Button, Input, Alert } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { useCMSSaveSection, type SaveResult } from "./CMSSaveContext";

interface CMSTextEditorProps {
  schemaKey: string;
  label: string;
  initial: string;
}

export function CMSTextEditor({
  schemaKey,
  label,
  initial,
}: CMSTextEditorProps): React.ReactElement {
  const [value, setValue] = useState(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { pending, error, runAction } = useFormAction();
  const section = useCMSSaveSection();

  const dirty = value !== initial;

  // Section-managed mode: register a saver + report dirty state. The section's
  // single Save button calls these. Skip rendering our own button below.
  useEffect(() => {
    if (!section) return;
    const saver = async (): Promise<SaveResult> => {
      if (value === initial) return { ok: true, saved: false };
      const res = await updateCMSBlock(schemaKey, { value });
      if (!res.ok) return { ok: false, saved: false, error: res.error };
      return { ok: true, saved: true };
    };
    return section.registerSaver(schemaKey, saver);
  }, [section, schemaKey, value, initial]);

  useEffect(() => {
    if (!section) return;
    section.reportDirty(schemaKey, dirty);
  }, [section, schemaKey, dirty]);

  function save(): void {
    runAction(async () => {
      const res = await updateCMSBlock(schemaKey, { value });
      if (!res.ok) throw new Error(res.error);
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        helperText={schemaKey}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {section ? null : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={save}
            isLoading={pending}
            disabled={!dirty}
          >
            {pending ? "Сохраняем..." : "Сохранить"}
          </Button>
          {savedAt && !dirty && !error ? (
            <span className="text-xs text-[var(--color-success,#16a34a)]">Сохранено</span>
          ) : null}
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      )}
      {section && dirty ? (
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-warning,#f59e0b)]">
          Не сохранено
        </span>
      ) : null}
    </div>
  );
}
