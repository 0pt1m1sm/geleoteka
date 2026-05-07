import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** Small uppercase eyebrow above the title (category, breadcrumb-like). */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned action slot — typically <Button> or links. */
  actions?: ReactNode;
  /** Layout: "left" (admin/portal default) or "center" (public marketing default). */
  align?: "left" | "center";
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
  children,
  className = "",
}: PageHeaderProps): React.ReactElement {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <header className={`mb-8 ${className}`.trim()}>
      <div className={`flex flex-wrap items-end justify-between gap-4 ${align === "center" ? "flex-col items-center" : ""}`.trim()}>
        <div className={`flex flex-col gap-2 max-w-2xl ${alignClass}`.trim()}>
          {eyebrow ? (
            <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">{eyebrow}</span>
          ) : null}
          <h1 className="text-display text-3xl sm:text-4xl font-bold leading-tight">{title}</h1>
          {description ? (
            <p className="text-base text-[var(--foreground-muted)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-3 shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}
