import type { HTMLAttributes } from "react";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Skeleton placeholder for loading states. Pulse animation respects prefers-reduced-motion. */
export function Skeleton({ className = "", ...rest }: SkeletonProps): React.ReactElement {
  return (
    <div
      aria-hidden
      className={`animate-pulse bg-[var(--card-hover)] rounded-[var(--radius-md)] ${className}`.trim()}
      {...rest}
    />
  );
}
