"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert, Button } from "@/components/ui";

interface Props {
  name: string;
  initial: string[];
  maxPhotos?: number;
  accept?: string;
}

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

export function PhotoUploader({
  name,
  initial,
  maxPhotos = 10,
  accept = DEFAULT_ACCEPT,
}: Props): React.ReactElement {
  const [urls, setUrls] = useState<string[]>(initial);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<void> {
    const fd = new FormData();
    fd.append("file", file);
    let res: Response;
    try {
      res = await fetch("/api/upload", { method: "POST", body: fd });
    } catch {
      setError("Сеть недоступна");
      return;
    }
    let json: { url?: string; error?: string };
    try {
      json = await res.json();
    } catch {
      setError("Сервер вернул некорректный ответ");
      return;
    }
    if (!res.ok || !json.url) {
      setError(json.error ?? `Ошибка загрузки (${res.status})`);
      return;
    }
    setUrls((prev) => (prev.length >= maxPhotos ? prev : [...prev, json.url!]));
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setError(null);
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (urls.length >= maxPhotos) break;
        await uploadOne(file);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove(idx: number): void {
    setUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDragStart(e: React.DragEvent, idx: number): void {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    // setData required for Firefox to fire drop events.
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function handleDragOver(e: React.DragEvent, idx: number): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIndex !== idx) setOverIndex(idx);
  }

  function handleDragLeave(): void {
    setOverIndex(null);
  }

  function handleDrop(e: React.DragEvent, targetIdx: number): void {
    e.preventDefault();
    setOverIndex(null);
    const sourceIdx = dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
    setDragIndex(null);
    if (Number.isNaN(sourceIdx) || sourceIdx === targetIdx) return;
    setUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  }

  const atLimit = urls.length >= maxPhotos;
  const triggerDisabled = isUploading || atLimit;

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(urls)} />

      {urls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-3">
          {urls.map((url, idx) => {
            const isOver = overIndex === idx && dragIndex !== idx;
            return (
              <div
                key={`${url}-${idx}`}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`relative group aspect-square bg-[var(--background-secondary)] rounded-lg overflow-hidden border-2 transition-colors cursor-move ${
                  isOver
                    ? "border-[var(--color-accent)]"
                    : "border-transparent"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary upload-server URL, not statically optimizable */}
                <img
                  src={url}
                  alt={`Фото ${idx + 1}`}
                  className="w-full h-full object-cover pointer-events-none"
                />
                {idx === 0 && (
                  <span className="absolute top-1 left-1 text-[10px] font-medium bg-[var(--color-accent)] text-black px-1.5 py-0.5 rounded">
                    Обложка
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  aria-label="Удалить фото"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-error)]"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={triggerDisabled}
          isLoading={isUploading}
        >
          {isUploading ? "Загрузка..." : "Загрузить фото"}
        </Button>
        <span className="text-xs text-[var(--foreground-muted)]">
          {urls.length} / {maxPhotos} · JPG, PNG, WebP, AVIF · до 5 МБ
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {atLimit && (
        <p className="text-xs text-[var(--foreground-muted)] mb-2">
          Достигнут лимит фотографий — удалите одну, чтобы загрузить новую.
        </p>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {urls.length > 1 && (
        <p className="text-xs text-[var(--foreground-muted)] mt-2">
          Перетащите фото, чтобы изменить порядок. Первое фото — обложка.
        </p>
      )}
    </div>
  );
}
