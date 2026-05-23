"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
} from "react";

/**
 * Wraps router.push/replace in a React transition so the global
 * NavigationProgress bar (which reads `isPending`) fires on programmatic
 * navigation, not only on <a> clicks. Same-route query-only updates
 * (filter toggles) bypass the transition so they never flash the bar.
 */
interface NavigateOptions {
  scroll?: boolean;
}

interface ProgressRouter {
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
}

// Navigate functions are stable for the provider's lifetime; isPending is a
// separate context so only the bar re-renders when it flips — call sites that
// consume the navigate functions never re-render on bar state.
const ProgressRouterContext = createContext<ProgressRouter | null>(null);
const NavPendingContext = createContext(false);

export function NavigationProgressProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const api = useMemo<ProgressRouter>(() => {
    // Same pathname = query-only update (filters). Navigate directly, no
    // transition, so the bar stays hidden. Different pathname = real route
    // change → wrap in a transition so isPending drives the bar.
    function isSameRoute(href: string): boolean {
      try {
        const url = new URL(href, window.location.origin);
        return url.pathname === window.location.pathname;
      } catch {
        return false;
      }
    }
    return {
      push(href, options) {
        if (isSameRoute(href)) {
          router.push(href, options);
          return;
        }
        startTransition(() => {
          router.push(href, options);
        });
      },
      replace(href, options) {
        if (isSameRoute(href)) {
          router.replace(href, options);
          return;
        }
        startTransition(() => {
          router.replace(href, options);
        });
      },
    };
  }, [router]);

  return (
    <ProgressRouterContext.Provider value={api}>
      <NavPendingContext.Provider value={isPending}>
        {children}
      </NavPendingContext.Provider>
    </ProgressRouterContext.Provider>
  );
}

/** Router wrapper that drives the global NavigationProgress bar. */
export function useProgressRouter(): ProgressRouter {
  const ctx = useContext(ProgressRouterContext);
  if (!ctx) {
    throw new Error(
      "useProgressRouter must be used within <NavigationProgressProvider>"
    );
  }
  return ctx;
}

/** True while a wrapped programmatic navigation is in flight. */
export function useNavPending(): boolean {
  return useContext(NavPendingContext);
}
