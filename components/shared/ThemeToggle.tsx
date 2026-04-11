"use client";

import { useCallback, useSyncExternalStore } from "react";

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

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getEffectiveTheme, () => "dark" as Theme);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const icon = theme === "dark" ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-2 transition-colors"
      style={{ color: "var(--foreground-muted)" }}
      aria-label={`Theme: ${theme}`}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      {icon}
    </button>
  );
}
