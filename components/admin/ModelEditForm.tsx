"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createModel,
  updateModel,
  deleteModel,
} from "@/app/actions/vehicle-catalog";
import { useFormAction } from "@/lib/use-form-action";

interface ModelInitial {
  id: string;
  slug: string;
  name: string;
  description: string;
  engines: string;
  features: string[];
  manufacturerId: string;
  isActive: boolean;
}

interface Props {
  mode: "create" | "edit";
  initial?: ModelInitial;
  manufacturers: Array<{ id: string; name: string }>;
}

export function ModelEditForm({ mode, initial, manufacturers }: Props): React.ReactElement {
  const router = useRouter();
  const { pending, error, setError, runAction } = useFormAction();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [engines, setEngines] = useState(initial?.engines ?? "");
  const [featuresText, setFeaturesText] = useState((initial?.features ?? []).join("\n"));
  const [manufacturerId, setManufacturerId] = useState(
    initial?.manufacturerId ?? manufacturers[0]?.id ?? "",
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function submit(): void {
    setError(null);
    if (!slug.trim() || !name.trim() || !manufacturerId) {
      setError("Слаг, название и производитель обязательны");
      return;
    }
    const features = featuresText
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);

    runAction(async () => {
      if (mode === "create") {
        const res = await createModel({
          slug,
          name,
          description,
          engines,
          features,
          manufacturerId,
          isActive,
        });
        router.push(`/admin/models/${res.id}`);
      } else if (initial) {
        await updateModel(initial.id, {
          slug,
          name,
          description,
          engines,
          features,
          manufacturerId,
          isActive,
        });
        router.refresh();
      }
    });
  }

  function handleDelete(): void {
    if (!initial) return;
    if (!confirm(`Удалить модель "${initial.name}"? Это удалит все её поколения. Запчасти останутся.`)) return;
    runAction(async () => {
      await deleteModel(initial.id);
      router.push("/admin/models");
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="manufacturerId" className="block text-sm font-medium mb-1">Производитель *</label>
        <select
          id="manufacturerId"
          value={manufacturerId}
          onChange={(e) => setManufacturerId(e.target.value)}
          className="input"
        >
          {manufacturers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">Название *</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="G-Class"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium mb-1">Слаг (URL) *</label>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="input font-mono"
            placeholder="g-class"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">Описание</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input min-h-[100px] resize-y"
          placeholder="Краткое описание модели для публичной страницы"
        />
      </div>

      <div>
        <label htmlFor="engines" className="block text-sm font-medium mb-1">Двигатели</label>
        <input
          id="engines"
          type="text"
          value={engines}
          onChange={(e) => setEngines(e.target.value)}
          className="input font-mono text-xs"
          placeholder="M276, M256, OM656"
        />
      </div>

      <div>
        <label htmlFor="features" className="block text-sm font-medium mb-1">Особенности</label>
        <textarea
          id="features"
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          className="input min-h-[100px] resize-y"
          placeholder="Одна особенность на строку"
        />
        <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
          По одной особенности на строку
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="w-4 h-4 accent-[var(--color-accent)]"
        />
        <span className="text-sm">Показывать на сайте</span>
      </label>

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn btn-primary disabled:opacity-50"
        >
          {pending ? "Сохранение..." : mode === "create" ? "Создать" : "Сохранить"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-sm text-[var(--color-error)] hover:opacity-80 disabled:opacity-40"
          >
            Удалить модель
          </button>
        )}
      </div>
    </div>
  );
}
