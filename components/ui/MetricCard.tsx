import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export type MetricCardVariant = "default" | "success" | "warning" | "accent";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  variant?: MetricCardVariant;
  /** Optional trend indicator: positive = up arrow, negative = down arrow. Pass numeric or null. */
  trend?: number | null;
  /** Subtitle below the value, e.g. unit or context. */
  description?: string;
  /** Optional CTA — renders chevron link below the value. */
  href?: string;
  hrefLabel?: string;
  className?: string;
}

const VALUE_COLOR: Record<MetricCardVariant, string> = {
  default: "",
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  accent: "text-[var(--color-accent)]",
};

/** MetricCard — compact stat tile for dashboards. */
export function MetricCard({
  label,
  value,
  variant = "default",
  trend = null,
  description,
  href,
  hrefLabel = "Подробнее",
  className = "",
}: MetricCardProps): React.ReactElement {
  return (
    <div className={`card flex flex-col gap-1 ${className}`.trim()}>
      <p className="text-sm text-[var(--foreground-muted)]">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={`text-3xl font-bold ${VALUE_COLOR[variant]}`.trim()}>{value}</p>
        {trend !== null && trend !== 0 ? (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              trend > 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
            }`}
          >
            {trend > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="text-xs text-[var(--foreground-muted)]">{description}</p>
      ) : null}
      {href ? (
        <Link
          href={href}
          className="text-xs text-[var(--color-accent)] hover:underline mt-1 self-start"
        >
          {hrefLabel} →
        </Link>
      ) : null}
    </div>
  );
}
