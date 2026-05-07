"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function getEffectiveTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  // Check explicit class first
  if (document.documentElement.classList.contains("light")) return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  // No explicit class — check system preference (matches @media prefers-color-scheme in CSS)
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function applyToDOM(theme: Theme) {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
}

let listeners: Array<() => void> = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

function setTheme(theme: Theme) {
  localStorage.setItem("theme", theme);
  applyToDOM(theme);
  listeners.forEach((l) => l());
}

export function ThemeToggle(): React.ReactElement {
  const theme = useSyncExternalStore(subscribe, getEffectiveTheme, () => "dark" as Theme);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const Icon = theme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-2 transition-colors text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
      aria-label={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}
