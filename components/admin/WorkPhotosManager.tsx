"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { confirm } from "@/lib/ui/confirm";
import {
  addRepairOrderPhoto,
  deleteRepairOrderPhoto,
  updateRepairOrderPhotoCaption,
} from "@/app/actions/repair-order-photos";

interface PhotoView {
  id: string;
  url: string;
  caption: string | null;
  createdAt: Date | string;
  uploadedBy: { id: string; name: string } | null;
}

interface Props {
  repairOrderId: string;
  initialPhotos: PhotoView[];
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/**
 * Upload + manage RepairOrder work photos. Used by ADMIN/MANAGER on
 * the admin order-detail page. Each tile shows the caption and lets
 * the manager edit it inline ("Колодки заменены") so the customer's
 * /cabinet/tracking gallery is meaningful, not raw photos.
 */
export function WorkPhotosManager({
  repairOrderId,
  initialPhotos,
}: Props): React.ReactElement {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCaptionFor, setPendingCaptionFor] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? `Ошибка загрузки (${res.status})`);
        return;
      }
      const created = await addRepairOrderPhoto({
        repairOrderId,
        url: json.url,
        caption: "",
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      setPendingCaptionFor(created.photoId);
      setCaptionDraft("");
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveCaption(photoId: string): Promise<void> {
    setError(null);
    const res = await updateRepairOrderPhotoCaption(photoId, captionDraft);
    if (!res.ok) setError(res.error);
    setPendingCaptionFor(null);
    router.refresh();
  }

  function startEditCaption(photoId: string, current: string | null): void {
    setPendingCaptionFor(photoId);
    setCaptionDraft(current ?? "");
  }

  async function handleDelete(photoId: string): Promise<void> {
    if (!(await confirm({ message: "Удалить это фото? Действие необратимо.", danger: true }))) return;
    setError(null);
    const res = await deleteRepairOrderPhoto(photoId);
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-semibold">Фотоотчёт работ</h3>
          <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
            Фото замены деталей, заправок жидкостей и т.п. — клиент видит их в
            личном кабинете.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          isLoading={uploading}
          disabled={uploading}
        >
          {uploading ? "Загрузка…" : "Добавить фото"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {initialPhotos.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-lg">
          Пока нет фото. Загрузите первое — клиент увидит прогресс.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {initialPhotos.map((p) => {
            const editing = pendingCaptionFor === p.id;
            return (
              <div
                key={p.id}
                className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background-secondary)] group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary upload-server URL */}
                <img
                  src={p.url}
                  alt={p.caption ?? "Фото работ"}
                  className="w-full h-full object-cover"
                />
                {!editing && (
                  <button
                    type="button"
                    onClick={() => startEditCaption(p.id, p.caption)}
                    className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs px-2 py-1.5 text-left hover:bg-black/85 transition-colors"
                  >
                    {p.caption ?? (
                      <span className="text-[var(--foreground-muted)] italic">
                        + добавить подпись
                      </span>
                    )}
                  </button>
                )}
                {editing && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/85 p-2 space-y-1.5">
                    <input
                      type="text"
                      value={captionDraft}
                      onChange={(e) => setCaptionDraft(e.target.value)}
                      placeholder="Подпись (например, «Колодки заменены»)"
                      className="input text-xs py-1"
                      autoFocus
                      maxLength={200}
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => void saveCaption(p.id)}
                        className="btn btn-primary text-[10px] px-2 py-0.5 flex-1"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingCaptionFor(null)}
                        className="btn btn-secondary text-[10px] px-2 py-0.5"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
                {!editing && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(p.id)}
                    aria-label="Удалить"
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-error)]"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
