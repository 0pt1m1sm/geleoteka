import { cloneElement, type ReactElement } from "react";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** The text to show inside the tooltip. */
  label: string;
  position?: TooltipPosition;
  /** A single interactive element. The tooltip attaches data-attrs to it. */
  children: ReactElement<{ "data-tooltip"?: string; "data-tooltip-position"?: TooltipPosition }>;
}

/**
 * CSS-only tooltip — activates on `:hover` AND `:focus-visible` (per WCAG 1.4.13).
 * Renders via `[data-tooltip]::after` pseudo-element styled in app/styles/components.css.
 */
export function Tooltip({ label, position = "top", children }: TooltipProps): React.ReactElement {
  return cloneElement(children, {
    "data-tooltip": label,
    "data-tooltip-position": position,
  });
}
