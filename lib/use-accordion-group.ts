"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

interface ManualOverride {
  pathname: string;
  /** null = explicitly closed (sentinel — distinct from "no override"). */
  openLabel: string | null;
}

/**
 * Single-open accordion state with pathname-tied reset.
 *
 * The active group derived from `activeGroupLabel` (caller-computed from
 * pathname) auto-opens. The user can manually toggle via the returned
 * setter; the override is stored against the current pathname. On
 * navigation, the stored pathname no longer matches and control returns
 * to the derived default — no setState-in-effect needed.
 *
 * This pattern (resetting state via a stored key) avoids the
 * react-hooks/set-state-in-effect lint rule.
 *
 * @returns `[openLabel, toggleLabel]` — `openLabel` is the currently-open
 *   group label (or null if all closed). `toggleLabel(label)` opens the
 *   group, or closes it if it was already open.
 */
export function useAccordionGroup(
  activeGroupLabel: string | null,
): [string | null, (label: string) => void] {
  const pathname = usePathname();
  const [override, setOverride] = useState<ManualOverride | null>(null);

  // Override only honored for the pathname it was set on. Once the user
  // navigates, the pathnames differ and the derived default takes over.
  const activeOverride =
    override && override.pathname === pathname ? override : null;
  const openLabel = activeOverride ? activeOverride.openLabel : activeGroupLabel;

  function toggleLabel(label: string): void {
    setOverride({
      pathname,
      openLabel: openLabel === label ? null : label,
    });
  }

  return [openLabel, toggleLabel];
}
