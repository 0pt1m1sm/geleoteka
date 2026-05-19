"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Global top-of-viewport progress bar shown during in-app navigation.
 * Industry-standard pattern (GitHub, Vercel, Linear) for telling the user
 * "your tap registered and the next page is loading" — without per-Link
 * wiring or extra dependencies.
 *
 * Mechanism:
 *   - Document-level click listener flips visible=true the moment an
 *     in-app anchor is clicked (skipped for external, _blank, download,
 *     modified-key, and same-route clicks).
 *   - usePathname + useSearchParams change triggers an effect that flips
 *     visible=false — App Router has no router.events, but a new render
 *     of the listener with a different (pathname, searchParams) tuple is
 *     reliable enough as a navigation-complete signal.
 *   - A safety timeout clears the bar after 8s in case a navigation is
 *     cancelled / errors out silently.
 *
 * Renders a 2px accent-colored bar with an indeterminate slide animation.
 */
export function NavigationProgress(): React.ReactElement | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  // Hide on every navigation completion (pathname or query change).
  // App Router has no router.events, so the only signal we have that
  // navigation finished is a re-render at a different (pathname,
  // searchParams) tuple. This is exactly the "synchronize external
  // system with React" case the rule is meant to allow — the previous
  // visible state was set in a DOM event handler, not in render, so
  // the cascading-render concern doesn't apply.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      // Ignore modified clicks (open in new tab, etc.) and non-primary buttons.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      // Same-origin check + same-route ignore.
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      setVisible(true);
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  // Safety timeout — if a navigation hangs we don't want the bar stuck on.
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[2px] z-[100] overflow-hidden pointer-events-none"
    >
      <div className="absolute inset-y-0 left-0 w-1/3 bg-[var(--color-accent)] animate-nav-progress" />
    </div>
  );
}
