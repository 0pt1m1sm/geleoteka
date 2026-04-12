"use client";

import { useLayoutEffect } from "react";

/**
 * Applies saved theme class on first render before paint.
 * useLayoutEffect runs synchronously after DOM mutations but before browser paint,
 * minimizing the theme flicker to an imperceptible frame.
 */
export function ThemeInit() {
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light") {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }
    } catch {}
  }, []);

  return null;
}
