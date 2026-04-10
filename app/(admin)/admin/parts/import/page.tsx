"use client";

import { useState } from "react";
import Link from "next/link";

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export default function ImportPartsPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/parts/import", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Ошибка загрузки");
    } else {
      setResult(data);
    }
    setUploading(false);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Импорт запчастей (CSV)</h1>

      <div className="card mb-6">
        <h3 className="font-medium mb-2">Формат CSV</h3>
        <p className="text-sm text-[var(--foreground-muted)] mb-3">
          Файл должен содержать колонки через точку с запятой (;):
        </p>
        <pre className="text-xs bg-[var(--background-secondary)] p-3 rounded-lg overflow-x-auto text-[var(--foreground-muted)]">
          артикул;название;описание;цена;количество;OEM(0/1);категория;модели{"\n"}
          A000989690613;Масло 5W-40 (5л);Оригинальное масло;6500;25;1;oils;G-Class,GLE
        </pre>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="file" className="block text-sm font-medium mb-2">CSV файл *</label>
          <input id="file" name="file" type="file" accept=".csv" required className="input" />
        </div>

        <div className="flex gap-4">
          <Link href="/admin/parts" className="btn btn-secondary">Отмена</Link>
          <button type="submit" disabled={uploading} className="btn btn-primary">
            {uploading ? "Импорт..." : "Загрузить"}
          </button>
        </div>
      </form>

      {result && (
        <div className="card mt-6">
          <h3 className="font-medium mb-3">Результат импорта</h3>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-bold text-[var(--color-success)]">{result.created}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Создано</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--color-info)]">{result.updated}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Обновлено</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--color-error)]">{result.errors.length}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Ошибок</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-[var(--color-error-bg)] p-3 rounded-lg">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-[var(--color-error)]">{err}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
