"use client";

import { useEffect, useRef, useState } from "react";
import { updateCMSBlock } from "@/app/actions/cms";
import { Button, Alert } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { useCMSSaveSection, type SaveResult } from "./CMSSaveContext";

interface CMSImageEditorProps {
  schemaKey: string;
  label: string;
  initial: string;
  helperText?: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/**
 * Hero/marketing image field. Two ways to set the URL:
 *  - Upload via /api/upload (drag/drop or button), or
 *  - Paste any URL (CDN, stock, etc.) into the input.
 *
 * Persists `{ url: string }` and integrates with CMSSaveContext so the
 * group-level "Сохранить раздел" button fires it alongside text fields.
 */
export function CMSImageEditor({
  schemaKey,
  label,
  initial,
  helperText,
}: CMSImageEditorProps): React.ReactElement {
  const [url, setUrl] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, error, runAction } = useFormAction();
  const section = useCMSSaveSection();

  const dirty = url !== initial;

  useEffect(() => {
    if (!section) return;
    const saver = async (): Promise<SaveResult> => {
      if (url === initial) return { ok: true, saved: false };
      const res = await updateCMSBlock(schemaKey, { url });
      if (!res.ok) return { ok: false, saved: false, error: res.error };
      return { ok: true, saved: true };
    };
    return section.registerSaver(schemaKey, saver);
  }, [section, schemaKey, url, initial]);

  useEffect(() => {
    if (!section) return;
    section.reportDirty(schemaKey, dirty);
  }, [section, schemaKey, dirty]);

  async function uploadFile(file: File): Promise<void> {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setUploadError(json.error ?? `Ошибка загрузки (${res.status})`);
        return;
      }
      setUrl(json.url);
    } catch {
      setUploadError("Сеть недоступна");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save(): void {
    runAction(async () => {
      const res = await updateCMSBlock(schemaKey, { url });
      if (!res.ok) throw new Error(res.error);
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label htmlFor={`cms-image-${schemaKey}`} className="block text-sm font-medium mb-1">
          {label}
        </label>
        {helperText ? (
          <p className="text-xs text-[var(--foreground-muted)] mb-2">{helperText}</p>
        ) : null}

        {url ? (
          <div className="mb-3 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background-secondary)] aspect-[16/9] max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary URL preview */}
            <img src={url} alt="Превью" className="w-full h-full object-cover" />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            isLoading={uploading}
          >
            {uploading ? "Загрузка..." : url ? "Заменить фото" : "Загрузить фото"}
          </Button>
          <span className="text-xs text-[var(--foreground-muted)]">
            JPG, PNG, WebP, AVIF · до 5 МБ
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />

        <input
          id={`cms-image-${schemaKey}`}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/images/hero/g-class-4k.jpg или https://..."
          className="input font-mono text-xs"
        />
        <p className="text-[10px] text-[var(--foreground-muted)] mt-1 font-mono">{schemaKey}</p>
      </div>

      {uploadError ? <Alert variant="error">{uploadError}</Alert> : null}

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
