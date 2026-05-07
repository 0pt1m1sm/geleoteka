/** Design tokens accessible from TypeScript.
 *
 * Single source of truth for COLORS lives in CSS custom properties (`app/styles/tokens.css`).
 * This file holds only values that JavaScript needs at runtime: breakpoint widths for
 * responsive logic, motion durations for `setTimeout` orchestration, and radius constants
 * for SVG path math. Do not duplicate colors here — read them via `getComputedStyle` if
 * absolutely required.
 */

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export const MOTION_DURATIONS = {
  fast: 150,
  base: 200,
  slow: 300,
} as const;

export const RADIUS_PX = {
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
  "2xl": 8,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
export type MotionDuration = keyof typeof MOTION_DURATIONS;
export type RadiusKey = keyof typeof RADIUS_PX;
