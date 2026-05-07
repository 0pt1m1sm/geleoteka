"use client";

import { useState } from "react";
import { updateCMSBlock } from "@/app/actions/cms";
import { Button, Input, Alert } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";

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

  function save(): void {
    runAction(async () => {
      const res = await updateCMSBlock(schemaKey, { value });
      if (!res.ok) throw new Error(res.error);
      setSavedAt(Date.now());
    });
  }

  const dirty = value !== initial;

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        helperText={schemaKey}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
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
    </div>
  );
}
