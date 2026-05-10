interface PhotoView {
  id: string;
  url: string;
  caption: string | null;
  createdAt: Date | string;
}

interface Props {
  photos: PhotoView[];
  /** Header label, defaults to «Фотоотчёт работ». */
  title?: string;
  /** Empty-state hint shown only when photos.length === 0. Pass null to render nothing in that case. */
  emptyText?: string | null;
}

/**
 * Read-only gallery of RepairOrder work photos for client/admin views.
 * Tap a tile to open the full-size image in a new tab. No upload or
 * delete actions — see WorkPhotosManager for the editable variant.
 */
export function WorkPhotosGallery({
  photos,
  title = "Фотоотчёт работ",
  emptyText = "Мастер ещё не добавил фотоотчёт.",
}: Props): React.ReactElement | null {
  if (photos.length === 0 && emptyText === null) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {photos.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-lg">
          {emptyText}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background-secondary)] block hover:border-[var(--color-accent)] transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary upload-server URL */}
              <img
                src={p.url}
                alt={p.caption ?? "Фото работ"}
                className="w-full h-full object-cover"
              />
              {p.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs px-2 py-1.5">
                  {p.caption}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
