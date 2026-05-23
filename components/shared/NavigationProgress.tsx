"use client";

import { useEffect, useRef, useState } from "react";
import { useNavPending, useProgressRouter } from "@/components/shared/NavigationProgressProvider";

/**
 * Global top-of-viewport progress bar shown during in-app navigation.
 * Industry-standard pattern (GitHub, Vercel, Linear) for telling the user
 * "your tap registered and the next page is loading" — without per-Link
 * wiring or extra dependencies.
 *
 * Mechanism — a single source of truth: the transition's pending state.
 *   - Programmatic navigation already goes through useProgressRouter, which
 *     wraps router.push/replace in a transition; the bar shows while that
 *     transition's isPending (navPending) is true.
 *   - Plain <a>/<Link> clicks are intercepted by a document-level capture
 *     listener and ALSO routed through useProgressRouter.push (preventDefault
 *     stops the Link's own navigation). This is the key fix: App Router keeps
 *     a transition pending until the destination's server content is actually
 *     ready, so the bar keeps animating for the WHOLE load. The previous
 *     fallback cleared on pathname change, which fires at route commit —
 *     before streamed/force-dynamic content finishes — so the bar stopped
 *     after one cycle while the page was still blank.
 *   - A minimum on-screen time (MIN_VISIBLE_MS) keeps the bar shown long
 *     enough to complete a visible sweep even when a navigation resolves
 *     almost instantly (prefetched / cached routes).
 *
 * Renders a 2px accent-colored bar with an indeterminate slide animation.
 */
const MIN_VISIBLE_MS = 600;

export function NavigationProgress(): React.ReactElement | null {
  const navPending = useNavPending();
  const nav = useProgressRouter();

  // Hold the bar on screen for at least MIN_VISIBLE_MS once a navigation
  // starts, so even an instant route change shows a perceptible sweep.
  const [shown, setShown] = useState(false);
  const shownSinceRef = useRef(0);
  useEffect(() => {
    if (navPending) {
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
  }, [navPending]);

  // Intercept in-app anchor clicks and route them through the progress router
  // so the bar's lifetime is the transition's, not the (too-early) pathname
  // commit. Skips anything that isn't a same-origin page route.
  useEffect(() => {
    function handleClick(e: MouseEvent): void {
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
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Not a client-routable page: API endpoints and file/asset links must
      // keep their native navigation (a client push would 404 in the router).
      if (url.pathname.startsWith("/api/")) return;
      if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) return;
      // Same-pathname target is a query-only update (filters) — let the Link /
      // its own handler deal with it; never hijack or flash the bar for those.
      if (url.pathname === window.location.pathname) return;

      e.preventDefault();
      nav.push(url.pathname + url.search + url.hash);
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [nav]);

  if (!shown) return null;
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[2px] z-[100] overflow-hidden pointer-events-none"
    >
      <div className="absolute inset-y-0 left-0 w-1/3 bg-[var(--color-accent)] animate-nav-progress" />
    </div>
  );
}
