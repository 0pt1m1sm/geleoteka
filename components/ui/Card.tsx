import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Apply hover treatment (`.card-hover`). Opt-in for non-interactive cards. */
  hover?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { hover = false, className = "", children, ...rest },
  ref,
) {
  const classes = `card${hover ? " card-hover" : ""} ${className}`.trim();
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});

interface SlotProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function CardHeader({ className = "", ...rest }: SlotProps): React.ReactElement {
  return <div className={`flex flex-col gap-1 mb-4 ${className}`.trim()} {...rest} />;
}

export function CardTitle({ className = "", ...rest }: HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return <h3 className={`text-lg font-semibold ${className}`.trim()} {...rest} />;
}

export function CardDescription({ className = "", ...rest }: HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={`text-sm text-[var(--foreground-muted)] ${className}`.trim()} {...rest} />;
}

export function CardContent({ className = "", ...rest }: SlotProps): React.ReactElement {
  return <div className={className} {...rest} />;
}

export function CardFooter({ className = "", ...rest }: SlotProps): React.ReactElement {
  return <div className={`flex items-center gap-3 mt-4 pt-4 border-t border-[var(--border)] ${className}`.trim()} {...rest} />;
}
