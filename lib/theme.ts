"use client";

/**
 * Текущая тема как внешнее хранилище.
 *
 * Жила приватно внутри ThemeToggle, поэтому подписаться на переключение больше
 * никто не мог — а просмотру письма это нужно: содержимое рисуется в отдельном
 * документе (iframe), который переменные оформления родителя не видит и должен
 * получать цвета явно.
 */

export type Theme = "dark" | "light";

export function getEffectiveTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  // Явного класса нет — как решает CSS через @media prefers-color-scheme.
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function applyToDOM(theme: Theme): void {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
}

let listeners: Array<() => void> = [];

export function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function setTheme(theme: Theme): void {
  localStorage.setItem("theme", theme);
  applyToDOM(theme);
  listeners.forEach((l) => l());
}

/** Значение переменной оформления с корня документа — чтобы отдать его туда,
 *  где переменные недоступны. Пустая строка, если переменной нет. */
export function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
