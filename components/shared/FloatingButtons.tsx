"use client";

import { useEffect, useRef, useState } from "react";

interface Channel {
  name: string;
  href: string;
  color: string;
  icon: React.ReactNode;
}

const TelegramIcon = (
  <svg width={26} height={26} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.9-.902-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.1.154.232.17.325.015.094.034.31.019.478z" />
  </svg>
);

const WhatsAppIcon = (
  <svg width={26} height={26} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Max messenger (VK Tech, 2025) — stylized "M" wordmark on the brand red disc.
const MaxIcon = (
  <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden>
    <text
      x="12"
      y="17"
      textAnchor="middle"
      fontFamily="system-ui, -apple-system, sans-serif"
      fontSize="16"
      fontWeight="900"
      fill="currentColor"
    >
      M
    </text>
  </svg>
);

const CHANNELS: Channel[] = [
  { name: "Telegram", href: "https://t.me/geleoteka", color: "#229ED9", icon: TelegramIcon },
  { name: "WhatsApp", href: "https://wa.me/74951234567", color: "#25D366", icon: WhatsAppIcon },
  { name: "Max", href: "https://max.ru/geleoteka", color: "#E60023", icon: MaxIcon },
];

export function FloatingButtons(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex flex-col items-end gap-3" role="menu" aria-label="Способы связи">
          {CHANNELS.map((c, i) => (
            <a
              key={c.name}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="floating-channel flex items-center gap-3"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => setOpen(false)}
            >
              <span className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] shadow-md">
                {c.name}
              </span>
              <span
                className="flex size-12 items-center justify-center rounded-full text-white shadow-lg"
                style={{ backgroundColor: c.color }}
              >
                {c.icon}
              </span>
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Закрыть меню связи" : "Связаться с нами"}
        aria-expanded={open}
        className="flex size-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-lg transition-transform hover:scale-105 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
      >
        {open ? (
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width={26} height={26} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
          </svg>
        )}
      </button>
    </div>
  );
}
