import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

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
  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || isLoading}
      data-loading={isLoading || undefined}
      {...rest}
    >
      {leftIcon ? <span aria-hidden className="inline-flex shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span aria-hidden className="inline-flex shrink-0">{rightIcon}</span> : null}
    </button>
  );
});
