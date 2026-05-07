"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Eye, EyeOff } from "lucide-react";
import { updateCMSBlock } from "@/app/actions/cms";
import { Button, Textarea, Alert } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";

interface CMSRichtextEditorProps {
  schemaKey: string;
  label: string;
  initial: string;
}

const HELPER_TEXT =
  "Поддерживается markdown: **жирный**, *курсив*, [текст ссылки](https://...), # заголовок, - список.";

export function CMSRichtextEditor({
  schemaKey,
  label,
  initial,
}: CMSRichtextEditorProps): React.ReactElement {
  const [value, setValue] = useState(initial);
  const [showPreview, setShowPreview] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { pending, error, runAction } = useFormAction();

  function save(): void {
    runAction(async () => {
      const res = await updateCMSBlock(schemaKey, { markdown: value });
      if (!res.ok) throw new Error(res.error);
      setSavedAt(Date.now());
    });
  }

  const dirty = value !== initial;

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label={label}
        helperText={`${schemaKey} — ${HELPER_TEXT}`}
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
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
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? (
            <>
              <EyeOff size={14} className="mr-1.5" />
              Скрыть предпросмотр
            </>
          ) : (
            <>
              <Eye size={14} className="mr-1.5" />
              Предпросмотр
            </>
          )}
        </Button>
        {savedAt && !dirty && !error ? (
          <span className="text-xs text-[var(--color-success,#16a34a)]">Сохранено</span>
        ) : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
      </div>
      {showPreview ? (
        <div className="border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--background-secondary)] p-3 text-sm">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
