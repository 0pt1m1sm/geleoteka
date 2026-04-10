"use client";

import { useState } from "react";

interface Props {
  images: string[];
  alt: string;
  aspectRatio?: string;
}

export function ImageGallery({ images, alt, aspectRatio = "4/3" }: Props) {
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
        className="bg-[var(--background-secondary)] rounded-lg overflow-hidden mb-3"
        style={{ aspectRatio }}
      >
        <img
          src={images[selected]}
          alt={alt}
          className="w-full h-full object-cover"
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
              className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${
                i === selected
                  ? "border-[var(--color-accent)]"
                  : "border-transparent hover:border-[var(--border-hover)]"
              }`}
            >
              <img src={img} alt={`${alt} — фото ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
