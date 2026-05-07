"use client";

import { useState } from "react";
import Image from "next/image";

interface Props {
  images: string[];
  alt: string;
  aspectRatio?: string;
}

export function ImageGallery({ images, alt, aspectRatio = "4/3" }: Props): React.ReactElement {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="bg-[var(--background-secondary)] rounded-lg flex flex-col items-center justify-center"
        style={{ aspectRatio }}
      >
        <span className="text-5xl font-black text-[var(--color-accent)] opacity-15">G</span>
        <span className="text-xs text-[var(--foreground-muted)] opacity-40 mt-2">Нет фото</span>
      </div>
    );
  }

  return (
    <div>
      {/* Main image */}
      <div
        className="relative bg-[var(--background-secondary)] rounded-lg overflow-hidden mb-3"
        style={{ aspectRatio }}
      >
        <Image
          src={images[selected]}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>

      {/* Thumbnails — only show if multiple images */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className={`relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${
                i === selected
                  ? "border-[var(--color-accent)]"
                  : "border-transparent hover:border-[var(--border-hover)]"
              }`}
              aria-label={`Показать фото ${i + 1}`}
              aria-pressed={i === selected}
            >
              <Image
                src={img}
                alt={`${alt} — фото ${i + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
