"use client";

import { useActionState } from "react";
import Link from "next/link";

import { createBlogPost, updateBlogPost } from "@/app/actions/blog";
import { AdminFormShell } from "./AdminFormShell";

interface InitialPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  published: boolean;
}

interface Props {
  initial?: InitialPost;
}

export function BlogPostForm({ initial }: Props): React.ReactElement {
  const action = initial ? updateBlogPost.bind(null, initial.id) : createBlogPost;
  const [state, formAction, isPending] = useActionState(action, null);
  const isEditing = !!initial;

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">Заголовок *</label>
          <input
            id="title"
            name="title"
            required
            maxLength={200}
            className="input"
            placeholder="Сколько стоит обслуживание Гелендвагена"
            defaultValue={initial?.title ?? ""}
          />
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-medium mb-2">Slug *</label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9-]+"
            title="Только латиница, цифры и дефисы"
            className="input font-mono"
            placeholder="skolko-stoit-obsluzhivanie-gelendvagena"
            defaultValue={initial?.slug ?? ""}
          />
        </div>

        <div>
          <label htmlFor="excerpt" className="block text-sm font-medium mb-2">Анонс</label>
          <textarea
            id="excerpt"
            name="excerpt"
            className="input min-h-[80px] resize-y"
            placeholder="Одно-два предложения для списка статей и description в поиске"
            defaultValue={initial?.excerpt ?? ""}
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium mb-2">
            Текст статьи (markdown) *
          </label>
          <textarea
            id="content"
            name="content"
            required
            className="input min-h-[400px] resize-y font-mono text-sm"
            placeholder={"## Подзаголовок\n\nАбзацы, списки и ссылки — обычный markdown."}
            defaultValue={initial?.content ?? ""}
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium mb-2">Теги</label>
          <input
            id="tags"
            name="tags"
            className="input"
            placeholder="обслуживание, цены, w463 — через запятую"
            defaultValue={initial?.tags.join(", ") ?? ""}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="published"
            defaultChecked={initial?.published ?? false}
            className="accent-[var(--color-accent)]"
          />
          Опубликована (видна на сайте и в sitemap)
        </label>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Сохранение…" : isEditing ? "Сохранить" : "Создать"}
          </button>
          <Link href="/admin/blog" className="btn btn-secondary">Отмена</Link>
        </div>
      </AdminFormShell>
    </form>
  );
}
