"use client";

import { useCallback, useSyncExternalStore } from "react";

import { getEffectiveTheme, setTheme, subscribe, type Theme } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

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
      className="btn-icon"
      aria-label={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}
