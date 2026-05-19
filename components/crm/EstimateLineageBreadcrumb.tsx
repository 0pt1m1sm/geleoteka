import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";

interface ChainNode {
  id: string;
  number: string | null;
  stage: string;
}

interface Props {
  chain: ChainNode[];
  currentId: string;
  hrefBuilder: (id: string) => string;
}

const MAX_VISIBLE = 6;

/**
 * Horizontal lineage trail shown above the estimate body when a revision
 * chain has more than two entries. The current node renders bold (no
 * link); others render as Links via the injected `hrefBuilder`.
 *
 * Renders nothing when the chain has 2 or fewer nodes — the
 * EstimateRevisionBanner already conveys parent/child relations for
 * those short chains.
 */
export function EstimateLineageBreadcrumb({
  chain,
  currentId,
  hrefBuilder,
}: Props): React.ReactElement | null {
  if (chain.length <= 2) return null;

  const visible = chain.slice(0, MAX_VISIBLE);
  const hiddenCount = chain.length - visible.length;

  return (
    <nav
      aria-label="Цепочка пересмотров сметы"
      className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-[var(--foreground-muted)]"
    >
      {visible.map((node, i) => {
        const label = node.number ?? node.id.slice(-6).toUpperCase();
        const stage = ESTIMATE_STAGE_LABELS[node.stage] ?? node.stage;
        const isCurrent = node.id === currentId;
        return (
          <span key={node.id} className="flex items-center gap-1.5">
            {i > 0 ? <ChevronRight size={12} className="shrink-0" aria-hidden /> : null}
            {isCurrent ? (
              <span className="font-semibold text-[var(--foreground)]">
                №{label} · {stage}
              </span>
            ) : (
              <Link
                href={hrefBuilder(node.id)}
                className="hover:text-[var(--color-accent)] hover:underline active:opacity-70 transition-opacity"
              >
                №{label} · {stage}
              </Link>
            )}
          </span>
        );
      })}
      {hiddenCount > 0 ? (
        <span className="ml-1 text-[var(--foreground-muted)]">
          … (ещё {hiddenCount})
        </span>
      ) : null}
    </nav>
  );
}
