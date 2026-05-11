import Link from "next/link";
import { Info } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface BannerTarget {
  id: string;
  number: string | null;
  createdAt: Date;
}

interface Props {
  mode: "revision" | "superseded";
  target: BannerTarget | null;
  href: string;
}

/**
 * Small accent banner for the revision flow. Two modes:
 *
 * - `revision`: shown on a child estimate, pointing back at its parent.
 * - `superseded`: shown on the parent (now SUPERSEDED), pointing forward
 *   to the latest active revision.
 *
 * Callers may pass `target={null}` unguarded — the component renders
 * nothing in that case.
 */
export function EstimateRevisionBanner({
  mode,
  target,
  href,
}: Props): React.ReactElement | null {
  if (!target) return null;

  const label = target.number ?? target.id.slice(-6).toUpperCase();
  const text =
    mode === "revision"
      ? `Это пересмотр сметы №${label} от ${formatDate(target.createdAt)}.`
      : `Эта смета пересмотрена. Открыть актуальную (№${label})`;
  const linkText = mode === "revision" ? "Открыть исходную →" : "→";

  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 px-4 py-3"
    >
      <Info size={16} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
      <span className="flex-1 text-sm text-[var(--foreground)]">{text}</span>
      <Link
        href={href}
        className="shrink-0 text-sm font-medium text-[var(--color-accent)] hover:underline"
      >
        {linkText}
      </Link>
    </div>
  );
}
