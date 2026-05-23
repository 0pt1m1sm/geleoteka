"use client";

import { useEffect, useRef, useState } from "react";
import { useNavPending } from "@/components/shared/NavigationProgressProvider";
import { TopProgressBar } from "@/components/shared/TopProgressBar";

/**
 * Top progress bar for PROGRAMMATIC navigation (router.push/replace wrapped in
 * a transition by useProgressRouter). The bar shows while that transition's
 * isPending (navPending) is true.
 *
 * Link/anchor navigations are NOT handled here — they are covered by route
 * `loading.tsx` fallbacks (which render <TopProgressBar/> too). Reason: a
 * transition deliberately keeps the old page and suppresses the loading.tsx
 * fallback, so transition-driven navs need this bar; plain Link clicks are not
 * transitions, so their segment's loading.tsx shows instead. The two paths are
 * mutually exclusive, so the bar never doubles, and both render the same visual.
 *
 * MIN_VISIBLE_MS keeps the bar on screen long enough to show a perceptible
 * sweep even when a transition resolves almost instantly.
 */
const MIN_VISIBLE_MS = 600;

export function NavigationProgress(): React.ReactElement | null {
  const navPending = useNavPending();
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

  if (!shown) return null;
  return <TopProgressBar />;
}
