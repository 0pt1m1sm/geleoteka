import type { ReactNode } from "react";
import Link from "next/link";

export interface PageHeaderProps {
  /** Small uppercase eyebrow above the title (category, breadcrumb-like). */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned action slot — typically <Button> or links. */
  actions?: ReactNode;
  /** Layout: "left" (admin/portal default) or "center" (public marketing default). */
  align?: "left" | "center";
  /** Optional "back" link rendered above the eyebrow (e.g. "/admin/warehouse"). */
  backHref?: string;
  /** Label for the back link (defaults to "Назад"). Only used when backHref is set. */
  backLabel?: string;
  /** Optional element to render below description (e.g. tabs, filter chips). */
  children?: ReactNode;
  className?: string;
}

/** PageHeader — consistent page entry surface across public/portal/admin layers. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  align = "left",
  backHref,
  backLabel,
  children,
  className = "",
}: PageHeaderProps): React.ReactElement {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <header className={`mb-8 min-w-0 max-w-full ${className}`.trim()}>
      <div className={`flex flex-wrap items-end justify-between gap-4 min-w-0 ${align === "center" ? "flex-col items-center" : ""}`.trim()}>
        <div className={`flex flex-col gap-2 max-w-2xl min-w-0 ${alignClass}`.trim()}>
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex w-fit items-center gap-1 py-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--color-accent)]"
            >
              <span aria-hidden="true">←</span>
              {backLabel ?? "Назад"}
            </Link>
          ) : null}
          {eyebrow ? (
            <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">{eyebrow}</span>
          ) : null}
          <h1 className="text-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight break-words">{title}</h1>
          {description ? (
            <p className="text-base text-[var(--foreground-muted)] break-words">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-3 shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}
