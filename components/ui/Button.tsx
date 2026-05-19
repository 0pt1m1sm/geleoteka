import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
  outline: "btn btn-outline",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "text-xs px-4 py-2",
  md: "",
  lg: "text-base px-8 py-4",
};

const SPINNER_SIZE: Record<ButtonSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

/** Button — semantic <button> with variants from the design system. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    className = "",
    disabled,
    ...rest
  },
  ref,
) {
  const classes = `${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`.trim();
  // When loading, replace leftIcon with a spinner so the press is unambiguously
  // visible. Label stays so the action's identity isn't lost.
  const startSlot = isLoading ? (
    <Loader2 size={SPINNER_SIZE[size]} className="animate-spin" aria-hidden />
  ) : leftIcon ? (
    <span aria-hidden className="inline-flex shrink-0">{leftIcon}</span>
  ) : null;
  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || isLoading}
      data-loading={isLoading || undefined}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {startSlot}
      <span>{children}</span>
      {rightIcon && !isLoading ? (
        <span aria-hidden className="inline-flex shrink-0">{rightIcon}</span>
      ) : null}
    </button>
  );
});
