import type { HTMLAttributes, ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

export type AlertVariant = "success" | "error" | "info" | "warning";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  icon?: ReactNode | false;
}

const VARIANT_CLASS: Record<AlertVariant, string> = {
  success: "alert alert-success",
  error: "alert alert-error",
  info: "alert alert-info",
  warning: "alert bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
};

const VARIANT_ICON: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle2 size={18} aria-hidden />,
  error: <AlertCircle size={18} aria-hidden />,
  info: <Info size={18} aria-hidden />,
  warning: <AlertTriangle size={18} aria-hidden />,
};

export function Alert({
  variant = "info",
  title,
  icon,
  children,
  className = "",
  ...rest
}: AlertProps): React.ReactElement {
  const visualIcon = icon === false ? null : icon ?? VARIANT_ICON[variant];
  return (
    <div role="alert" className={`flex items-start gap-3 ${VARIANT_CLASS[variant]} ${className}`.trim()} {...rest}>
      {visualIcon ? <span className="shrink-0 mt-0.5">{visualIcon}</span> : null}
      <div className="flex-1">
        {title ? <p className="font-medium mb-0.5">{title}</p> : null}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
