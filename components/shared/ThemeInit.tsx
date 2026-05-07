"use client";

import { useLayoutEffect } from "react";

/**
 * Mirrors `/public/theme-init.js` on hydration so the React tree agrees with the
 * pre-paint class application. The `<Script src="/theme-init.js" strategy="beforeInteractive" />`
 * in `app/layout.tsx` runs first and applies `html.light` or `html.dark` before paint;
 * this component re-syncs after React hydrates, in case localStorage changed during
 * the bridge or another tab fired a storage event.
 *
 * Logic mirrors theme-init.js exactly: explicit saved theme wins; otherwise OS preference
 * decides; final fallback is dark.
 */
export function ThemeInit(): null {
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      const root = document.documentElement;
      if (saved === "light") {
        root.classList.add("light");
        root.classList.remove("dark");
      } else if (saved === "dark") {
        root.classList.add("dark");
        root.classList.remove("light");
      } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        root.classList.add("light");
        root.classList.remove("dark");
      } else {
        root.classList.add("dark");
        root.classList.remove("light");
      }
    } catch {
      // localStorage / matchMedia unavailable — pre-paint script handled the default.
    }
  }, []);

  return null;
}
