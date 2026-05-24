import Link from "next/link";

const LINKS = [
  { href: "/admin/warehouse/reports/valuation", label: "Оценка" },
  { href: "/admin/warehouse/reports/movements", label: "Движения" },
  { href: "/admin/warehouse/reports/analysis", label: "Анализ" },
] as const;

/** Sub-navigation across the WMS Phase 6 report pages. `active` bolds the current
 *  one; `wh` (the active warehouse id) is preserved across tabs so switching
 *  reports does not silently fall back to the default warehouse. */
export function ReportsNav({
  active,
  wh,
}: {
  active: "valuation" | "movements" | "analysis";
  wh?: string;
}): React.ReactElement {
  const qs = wh ? `?wh=${encodeURIComponent(wh)}` : "";
  return (
    <nav aria-label="Отчёты склада" className="flex flex-wrap gap-2 text-sm">
      {LINKS.map((l) => {
        const isActive = l.href.endsWith(active);
        return (
          <Link
            key={l.href}
            href={`${l.href}${qs}`}
            className={`badge ${isActive ? "bg-[var(--color-accent)] text-black" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
