"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useNavPending } from "@/components/shared/NavigationProgressProvider";

/**
 * Global top-of-viewport progress bar shown during in-app navigation.
 * Industry-standard pattern (GitHub, Vercel, Linear) for telling the user
 * "your tap registered and the next page is loading" — without per-Link
 * wiring or extra dependencies.
 *
 * Mechanism:
 *   - Programmatic navigation via useProgressRouter wraps router.push/replace
 *     in a transition; the bar shows while that transition's isPending is true.
 *   - As a fallback for plain <a>/<Link> clicks (which don't go through the
 *     wrapper), a document-level click listener flips anchorVisible=true the
 *     moment an in-app anchor is clicked (skipped for external, _blank,
 *     download, modified-key, and same-route clicks).
 *   - usePathname + useSearchParams change triggers an effect that clears the
 *     anchor fallback — App Router has no router.events, but a new render at a
 *     different (pathname, searchParams) tuple is a reliable completion signal.
 *   - A safety timeout clears the anchor fallback after 8s in case a
 *     navigation is cancelled / errors out silently.
 *   - A minimum on-screen time (MIN_VISIBLE_MS) keeps the bar shown long
 *     enough to complete a visible sweep even when the navigation resolves
 *     almost instantly (prefetched / cached routes). Without it a fast nav
 *     mounts and unmounts the bar within a frame or two, so the slide never
 *     becomes visible — the bar "appears but doesn't run".
 *
 * Renders a 2px accent-colored bar with an indeterminate slide animation.
 */
const MIN_VISIBLE_MS = 600;

export function NavigationProgress(): React.ReactElement | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navPending = useNavPending();
  const [anchorVisible, setAnchorVisible] = useState(false);
  const active = navPending || anchorVisible;

  // Hold the bar on screen for at least MIN_VISIBLE_MS once a navigation
  // starts, so even an instant route change shows a perceptible sweep.
  const [shown, setShown] = useState(false);
  const shownSinceRef = useRef(0);
  useEffect(() => {
    if (active) {
      if (shownSinceRef.current === 0) shownSinceRef.current = Date.now();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(true);
      return;
    }
    if (shownSinceRef.current === 0) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownSinceRef.current));
    const t = window.setTimeout(() => {
      shownSinceRef.current = 0;
      setShown(false);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [active]);

  const visible = shown;

  // Clear the anchor-click fallback on every navigation completion (pathname
  // or query change). App Router has no router.events, so the only signal we
  // have that navigation finished is a re-render at a different (pathname,
  // searchParams) tuple. The transition-driven path (navPending) clears
  // itself when the transition resolves, so it needs no effect here. This is
  // the "synchronize external system with React" case the rule allows — the
  // previous state was set in a DOM event handler, not in render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchorVisible(false);
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
      // Same-origin check + same-route ignore. A same-pathname target is a
      // query-only update (filters) — never flash the bar for those.
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname) return;
      } catch {
        return;
      }
      setAnchorVisible(true);
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  // Safety timeout — if an anchor navigation hangs we don't want the bar stuck
  // on. The transition-driven path clears itself, so only guard the fallback.
  useEffect(() => {
    if (!anchorVisible) return;
    const t = window.setTimeout(() => setAnchorVisible(false), 8000);
    return () => window.clearTimeout(t);
  }, [anchorVisible]);

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
