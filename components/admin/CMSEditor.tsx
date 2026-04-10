"use client";

import { useState } from "react";
import { updateCMSBlock } from "@/app/actions/cms";

interface CMSBlock {
  id: string;
  key: string;
  content: Record<string, string>;
}

const KEY_LABELS: Record<string, string> = {
  "home.hero.title": "Главная — заголовок",
  "home.hero.subtitle": "Главная — подзаголовок",
  "home.stats.years": "Статистика — лет опыта",
  "home.stats.cars": "Статистика — авто в год",
  "home.stats.satisfaction": "Статистика — довольных клиентов",
  "home.stats.parts": "Статистика — запчастей",
  "contacts.phone.service": "Контакты — телефон сервиса",
  "contacts.phone.parts": "Контакты — телефон запчастей",
  "contacts.email": "Контакты — email",
  "contacts.address": "Контакты — адрес",
  "contacts.hours.service": "Контакты — часы сервиса",
  "contacts.hours.parts": "Контакты — часы запчастей",
};

export function CMSEditor({ blocks }: { blocks: CMSBlock[] }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      blocks.map((b) => [b.key, b.content.text ?? b.content.value ?? ""])
    )
  );

  async function save(key: string) {
    setSaving(key);
    const block = blocks.find((b) => b.key === key);
    if (!block) return;

    const contentKey = block.content.text !== undefined ? "text" : "value";
    await updateCMSBlock(key, { [contentKey]: values[key] });
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <div key={block.id} className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">
                {KEY_LABELS[block.key] ?? block.key}
              </label>
              <p className="text-[10px] text-[var(--foreground-muted)] mb-2 font-mono">
                {block.key}
              </p>
              <input
                type="text"
                value={values[block.key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [block.key]: e.target.value })
                }
                className="input"
              />
            </div>
            <button
              type="button"
              onClick={() => save(block.key)}
              disabled={saving === block.key}
              className="btn btn-primary text-xs py-1 px-3 mt-6"
            >
              {saving === block.key ? "..." : "Сохранить"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
