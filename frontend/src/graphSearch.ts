import type { PositionedNode } from "./layout";

export function findGraphSearchMatches(nodes: PositionedNode[] | undefined, query: string): PositionedNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized || !nodes) {
    return [];
  }
  return [...nodes]
    .filter((node) => `${node.id} ${node.name} ${node.namespace}`.toLowerCase().includes(normalized))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

export function nextGraphSearchIndex(current: number, matchCount: number, direction: 1 | -1): number {
  if (matchCount === 0) {
    return -1;
  }
  const base = current >= 0 ? current : 0;
  return (base + direction + matchCount) % matchCount;
}
