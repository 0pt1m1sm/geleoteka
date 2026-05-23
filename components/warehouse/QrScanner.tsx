"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

interface QrScannerProps {
  /** Called with the raw decoded/entered code (camera or manual). */
  onScan: (raw: string) => void;
  /** Disable inputs while a scan is being processed. */
  busy?: boolean;
}

/**
 * Phone-camera QR scanner with a manual-entry fallback. Decodes via
 * @zxing/browser (canvas-based, works on iOS Safari where BarcodeDetector is
 * absent), prefers the rear camera, and guards against duplicate reads within
 * 1 s. Manual entry is always available — and is the fallback when the camera
 * is unavailable or permission is denied.
 */
export function QrScanner({ onScan, busy = false }: QrScannerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const manualRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  function dispatch(raw: string): void {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    // 1 s duplicate-scan guard: ignore the same code re-read within a second.
    if (code === lastScanRef.current.code && now - lastScanRef.current.at < 1000) return;
    lastScanRef.current = { code, at: now };
    onScan(code);
  }

  function stopCamera(): void {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActive(false);
  }

  async function startCamera(): Promise<void> {
    setCamError(null);
    if (!videoRef.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result) => {
          if (result) dispatch(result.getText());
        },
      );
      setActive(true);
    } catch {
      setCamError("Камера недоступна. Введите код вручную.");
      setActive(false);
    }
  }

  // Stop the camera + release the MediaStream on unmount.
  useEffect(() => () => controlsRef.current?.stop(), []);

  function handleManualSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    dispatch(manualRef.current?.value ?? "");
    if (manualRef.current) manualRef.current.value = "";
    manualRef.current?.focus();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={active ? stopCamera : startCamera}
          aria-pressed={active}
          className="btn btn-secondary min-h-[44px]"
        >
          {active ? "Остановить камеру" : "Сканировать камерой"}
        </button>
        {active && <span className="text-xs text-[var(--foreground-muted)]">Наведите камеру на QR-код</span>}
      </div>

      {/* Video stays mounted but hidden when inactive so the ref is stable. */}
      <video
        ref={videoRef}
        className={active ? "w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)]" : "hidden"}
        muted
        playsInline
        aria-label="Видоискатель сканера"
      />

      {camError && <p className="alert-error">{camError}</p>}

      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <input
          ref={manualRef}
          autoFocus
          type="text"
          inputMode="text"
          aria-label="Код QR, штрихкод или артикул"
          placeholder="Отсканируйте или введите код"
          disabled={busy}
          className="input flex-1 min-h-[44px]"
        />
        <button type="submit" disabled={busy} className="btn btn-secondary min-h-[44px]">
          Найти
        </button>
      </form>
    </div>
  );
}
