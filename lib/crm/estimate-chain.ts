import { db } from "@/lib/db";

export interface EstimateChainNode {
  id: string;
  number: string | null;
  stage: string;
  createdAt: Date;
}

export interface EstimateChainResult {
  /** Direct parent (one step up). Null when the current estimate has no parent. */
  parent: EstimateChainNode | null;
  /** Newest non-SUPERSEDED descendant in the down-chain, or null. */
  activeRevision: EstimateChainNode | null;
  /** Full lineage oldest→newest, current included, hard-capped at MAX_DEPTH. */
  chain: EstimateChainNode[];
}

const MAX_DEPTH = 6;

interface EstimateChainRow {
  id: string;
  number: string | null;
  stage: string;
  createdAt: Date;
  parentEstimateId: string | null;
}

/**
 * Walk the revision lineage of an estimate. Hard-capped at MAX_DEPTH hops
 * in each direction, with a visited-id guard against cycles. Returns the
 * direct parent (if any), the newest non-SUPERSEDED descendant, and the
 * full ordered chain (oldest→newest, current included).
 */
export async function getEstimateChain(
  estimateId: string,
): Promise<EstimateChainResult> {
  const current = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      number: true,
      stage: true,
      createdAt: true,
      parentEstimateId: true,
    },
  })) as EstimateChainRow | null;
  if (!current) {
    return { parent: null, activeRevision: null, chain: [] };
  }

  const visited = new Set<string>([current.id]);

  // Walk up.
  const ancestors: EstimateChainNode[] = [];
  let parentId = current.parentEstimateId;
  while (parentId && !visited.has(parentId) && ancestors.length < MAX_DEPTH) {
    visited.add(parentId);
    const row = (await db.estimate.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        number: true,
        stage: true,
        createdAt: true,
        parentEstimateId: true,
      },
    })) as EstimateChainRow | null;
    if (!row) break;
    ancestors.unshift({ id: row.id, number: row.number, stage: row.stage, createdAt: row.createdAt });
    parentId = row.parentEstimateId;
  }

  // Walk down — BFS, capped.
  const descendants: EstimateChainNode[] = [];
  let frontier: string[] = [current.id];
  while (frontier.length > 0 && descendants.length < MAX_DEPTH) {
    const rows = (await db.estimate.findMany({
      where: { parentEstimateId: { in: frontier } },
      select: { id: true, number: true, stage: true, createdAt: true, parentEstimateId: true },
      orderBy: { createdAt: "asc" },
    })) as EstimateChainRow[];
    const next: string[] = [];
    for (const row of rows) {
      if (visited.has(row.id)) continue;
      visited.add(row.id);
      descendants.push({ id: row.id, number: row.number, stage: row.stage, createdAt: row.createdAt });
      next.push(row.id);
      if (descendants.length >= MAX_DEPTH) break;
    }
    frontier = next;
  }

  const parent: EstimateChainNode | null =
    ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

  // Newest non-SUPERSEDED descendant — scan in reverse so the freshest
  // active revision wins when there are siblings.
  let activeRevision: EstimateChainNode | null = null;
  for (let i = descendants.length - 1; i >= 0; i--) {
    if (descendants[i].stage !== "SUPERSEDED") {
      activeRevision = descendants[i];
      break;
    }
  }

  const currentNode: EstimateChainNode = {
    id: current.id,
    number: current.number,
    stage: current.stage,
    createdAt: current.createdAt,
  };
  const chain = [...ancestors, currentNode, ...descendants].slice(0, MAX_DEPTH);

  return { parent, activeRevision, chain };
}
