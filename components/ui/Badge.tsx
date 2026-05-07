import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "silver"
  | "gold"
  | "amg";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "badge",
  success: "badge alert-success",
  warning: "badge bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  error: "badge alert-error",
  info: "badge alert-info",
  silver: "badge badge-silver",
  gold: "badge badge-gold",
  amg: "badge badge-amg",
};

export function Badge({ variant = "neutral", className = "", children, ...rest }: BadgeProps): React.ReactElement {
  return (
    <span className={`${VARIANT_CLASS[variant]} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
