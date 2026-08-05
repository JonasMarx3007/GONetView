import type { GOEdge, GOTerm } from "./types";

export type PositionedNode = GOTerm & {
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
};

export type PositionedEdge = GOEdge & {
  path: string;
  markerPath: string;
};

export type LayoutGraph = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
};

export type LayoutMode = "classic" | "readable";

const CARD_WIDTH = 226;
const HEADER_HEIGHT = 30;
const LINE_HEIGHT = 23;
const MIN_BODY_HEIGHT = 70;
const X_GAP = 34;
const Y_GAP = 62;
const PAD_X = 36;
const PAD_Y = 34;
const READABLE_MARGIN = 24;
type ElkLike = {
  layout: (graph: any) => Promise<any>;
};

let elkPromise: Promise<ElkLike> | null = null;

type ElkPoint = {
  x: number;
  y: number;
};

type ElkSection = {
  startPoint?: ElkPoint;
  endPoint?: ElkPoint;
  bendPoints?: ElkPoint[];
};

type ElkLayoutNode = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkLayoutNode[];
  edges?: ElkLayoutEdge[];
};

type ElkLayoutEdge = {
  id: string;
  sections?: ElkSection[];
};

export function layoutGraph(nodes: GOTerm[], edges: GOEdge[]): LayoutGraph {
  return layoutClassicGraph(nodes, edges);
}

// Layered layout cost grows far faster than graph size: on real GO graphs the quality profile
// takes about 6 s at 465 nodes and 46 s at 901, while the fast profile takes 1.9 s and 9.1 s.
// Large graphs therefore trade node placement and crossing minimisation for a usable wait.
export type ReadableLayoutProfile = "quality" | "fast";

const QUALITY_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
};

const FAST_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.layered.thoroughness": "1",
  "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
  "elk.layered.nodePlacement.strategy": "SIMPLE",
};

export async function layoutReadableGraph(
  nodes: GOTerm[],
  edges: GOEdge[],
  profile: ReadableLayoutProfile = "quality",
): Promise<LayoutGraph> {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const visibleLevels = [...new Set(nodes.map((node) => node.level ?? 0))].sort((a, b) => a - b);
  const levelIndex = new Map(visibleLevels.map((level, index) => [level, index]));
  const maxPartition = Math.max(0, visibleLevels.length - 1);
  const sizeById = new Map(
    nodes.map((node) => [
      node.id,
      {
        width: CARD_WIDTH,
        height: heightForName(node.name),
      },
    ]),
  );

  const elk = await loadElk();
  const layout = (await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "UP",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.partitioning.activate": "true",
      "elk.separateConnectedComponents": "false",
      "elk.padding": `[top=${READABLE_MARGIN},left=${READABLE_MARGIN},bottom=${READABLE_MARGIN},right=${READABLE_MARGIN}]`,
      "elk.spacing.nodeNode": "28",
      "elk.spacing.edgeNode": "18",
      "elk.layered.spacing.nodeNodeBetweenLayers": "76",
      "elk.layered.spacing.edgeNodeBetweenLayers": "18",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "20",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.mergeEdges": "false",
      "elk.layered.unnecessaryBendpoints": "true",
      ...(profile === "fast" ? FAST_LAYOUT_OPTIONS : QUALITY_LAYOUT_OPTIONS),
    },
    children: [...nodes]
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.id.localeCompare(b.id))
      .map((node) => ({
      id: node.id,
      width: sizeById.get(node.id)?.width ?? CARD_WIDTH,
      height: sizeById.get(node.id)?.height ?? MIN_BODY_HEIGHT + HEADER_HEIGHT,
      layoutOptions: {
        "elk.partitioning.partition": String(
          maxPartition - (levelIndex.get(node.level ?? visibleLevels[0] ?? 0) ?? 0),
        ),
      },
    })),
    edges: edges.map((edge, index) => ({
      id: `e-${index}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  })) as ElkLayoutNode;

  const layoutChildren = layout.children ?? [];
  const positionedNodes = layoutChildren
    .map((child) => {
      const sourceNode = nodes.find((node) => node.id === child.id);
      if (!sourceNode) {
        return null;
      }
      return {
        ...sourceNode,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? sizeById.get(child.id)?.width ?? CARD_WIDTH,
        height: child.height ?? sizeById.get(child.id)?.height ?? MIN_BODY_HEIGHT + HEADER_HEIGHT,
        rank: levelIndex.get(sourceNode.level ?? visibleLevels[0] ?? 0) ?? 0,
      };
    })
    .filter((node): node is PositionedNode => Boolean(node));

  const byId = new Map(positionedNodes.map((node) => [node.id, node]));
  const layoutEdges = new Map((layout.edges ?? []).map((edge) => [edge.id, edge]));
  const positionedEdges = edges
    .map((edge, index) => makeElkEdge(edge, byId, layoutEdges.get(`e-${index}`)))
    .filter((edge): edge is PositionedEdge => Boolean(edge));

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    width: Math.max(760, Math.ceil(layout.width ?? 0)),
    height: Math.max(560, Math.ceil(layout.height ?? 0)),
  };
}

// ELK is the expensive part of a readable layout, so it runs in its own worker through elkjs's
// worker API. The bundled in-process build stays as a fallback where workers are unavailable.
async function loadElk(): Promise<ElkLike> {
  elkPromise ??= createWorkerElk().catch(() =>
    import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK() as ElkLike),
  );
  return elkPromise;
}

async function createWorkerElk(): Promise<ElkLike> {
  if (typeof Worker === "undefined") {
    throw new Error("Workers are unavailable.");
  }
  const { default: ELK } = await import("elkjs/lib/elk-api.js");
  return new ELK({
    workerFactory: () => new Worker(new URL("elkjs/lib/elk-worker.min.js", import.meta.url), { type: "classic" }),
  }) as ElkLike;
}

function layoutClassicGraph(nodes: GOTerm[], edges: GOEdge[]): LayoutGraph {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const parentMap = new Map<string, string[]>();
  const childMap = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.relation !== "is_a") {
      continue;
    }
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }
    parentMap.set(edge.source, [...(parentMap.get(edge.source) ?? []), edge.target]);
    childMap.set(edge.target, [...(childMap.get(edge.target) ?? []), edge.source]);
  }

  const memo = new Map<string, number>();
  const rankOf = (nodeId: string, visiting = new Set<string>()): number => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(nodeId)) {
      return 0;
    }
    visiting.add(nodeId);
    const parents = parentMap.get(nodeId) ?? [];
    const rank = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => rankOf(parent, visiting))) + 1;
    visiting.delete(nodeId);
    memo.set(nodeId, rank);
    return rank;
  };

  const minVisibleLevel = Math.min(...nodes.map((node) => node.level ?? rankOf(node.id)));
  const buckets = new Map<number, GOTerm[]>();
  for (const node of nodes) {
    const rank = node.level === undefined ? rankOf(node.id) : Math.max(0, node.level - minVisibleLevel);
    buckets.set(rank, [...(buckets.get(rank) ?? []), node]);
  }

  const positioned: PositionedNode[] = [];
  let width = 0;
  let y = PAD_Y;
  const sortedRanks = [...buckets.keys()].sort((a, b) => a - b);
  const orderedRows = orderClassicRows(sortedRanks, buckets, parentMap, childMap);

  for (const rank of sortedRanks) {
    const row = orderedRows.get(rank) ?? [];
    const rowHeights = row.map((node) => heightForName(node.name));
    const rowHeight = Math.max(...rowHeights, HEADER_HEIGHT + MIN_BODY_HEIGHT);
    const gapX = rowGapX(row.length);
    const rowWidth = row.length * CARD_WIDTH + Math.max(0, row.length - 1) * gapX;
    width = Math.max(width, rowWidth + PAD_X * 2);
    let x = PAD_X;

    row.forEach((node, index) => {
      positioned.push({
        ...node,
        x,
        y,
        width: CARD_WIDTH,
        height: rowHeights[index],
        rank,
      });
      x += CARD_WIDTH + gapX;
    });
    y += rowHeight + rowGapY(rank, orderedRows, parentMap, childMap);
  }

  const centered = centerRows(positioned, width);
  const byId = new Map(centered.map((node) => [node.id, node]));
  const positionedEdges = edges
    .map((edge) => makeClassicEdge(edge, byId.get(edge.source), byId.get(edge.target)))
    .filter((edge): edge is PositionedEdge => Boolean(edge));

  return {
    nodes: centered,
    edges: positionedEdges,
    width,
    height: Math.max(520, y + PAD_Y),
  };
}

export function wrapName(name: string): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 24 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines.slice(0, 4);
}

function heightForName(name: string): number {
  return HEADER_HEIGHT + Math.max(MIN_BODY_HEIGHT, wrapName(name).length * LINE_HEIGHT + 30);
}

function centerRows(nodes: PositionedNode[], width: number): PositionedNode[] {
  const ranks = new Map<number, PositionedNode[]>();
  for (const node of nodes) {
    ranks.set(node.rank, [...(ranks.get(node.rank) ?? []), node]);
  }
  const result: PositionedNode[] = [];
  for (const row of ranks.values()) {
    const gapX = rowGapX(row.length);
    const rowWidth = row.length * CARD_WIDTH + Math.max(0, row.length - 1) * gapX;
    const offset = (width - rowWidth) / 2 - PAD_X;
    result.push(...row.map((node) => ({ ...node, x: node.x + offset })));
  }
  return result;
}

function orderClassicRows(
  sortedRanks: number[],
  buckets: Map<number, GOTerm[]>,
  parentMap: Map<string, string[]>,
  childMap: Map<string, string[]>,
): Map<number, GOTerm[]> {
  const rows = new Map(
    sortedRanks.map((rank) => [
      rank,
      [...(buckets.get(rank) ?? [])].sort((a, b) => {
        const aChildren = childMap.get(a.id)?.length ?? 0;
        const bChildren = childMap.get(b.id)?.length ?? 0;
        return bChildren - aChildren || a.id.localeCompare(b.id);
      }),
    ]),
  );

  for (let sweep = 0; sweep < 4; sweep += 1) {
    const topOrder = buildOrderMap(rows);
    for (const rank of sortedRanks.slice(1)) {
      const row = rows.get(rank) ?? [];
      row.sort((a, b) => barycenter(a.id, parentMap, topOrder) - barycenter(b.id, parentMap, topOrder) || a.id.localeCompare(b.id));
    }
    const bottomOrder = buildOrderMap(rows);
    for (const rank of [...sortedRanks].reverse().slice(1)) {
      const row = rows.get(rank) ?? [];
      row.sort((a, b) => barycenter(a.id, childMap, bottomOrder) - barycenter(b.id, childMap, bottomOrder) || a.id.localeCompare(b.id));
    }
  }

  return rows;
}

function buildOrderMap(rows: Map<number, GOTerm[]>): Map<string, number> {
  const order = new Map<string, number>();
  for (const row of rows.values()) {
    row.forEach((node, index) => order.set(node.id, index));
  }
  return order;
}

function barycenter(nodeId: string, neighborMap: Map<string, string[]>, order: Map<string, number>): number {
  const neighbors = neighborMap.get(nodeId) ?? [];
  const values = neighbors.map((neighbor) => order.get(neighbor)).filter((value): value is number => value !== undefined);
  if (values.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rowGapX(nodeCount: number): number {
  return X_GAP + Math.min(58, Math.max(0, nodeCount - 2) * 4);
}

function rowGapY(
  rank: number,
  rows: Map<number, GOTerm[]>,
  parentMap: Map<string, string[]>,
  childMap: Map<string, string[]>,
): number {
  const row = rows.get(rank) ?? [];
  const previous = rows.get(rank - 1) ?? [];
  const fanout = Math.max(
    ...row.map((node) => (parentMap.get(node.id)?.length ?? 0) + (childMap.get(node.id)?.length ?? 0)),
    ...previous.map((node) => (parentMap.get(node.id)?.length ?? 0) + (childMap.get(node.id)?.length ?? 0)),
    0,
  );
  return Y_GAP + Math.min(88, Math.max(row.length, previous.length) * 4 + fanout * 6);
}

function makeClassicEdge(edge: GOEdge, source?: PositionedNode, target?: PositionedNode): PositionedEdge | null {
  if (!source || !target) {
    return null;
  }
  const sx = source.x + source.width / 2;
  const sy = source.y;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height;
  const dy = Math.max(34, sy - ty);
  const curve = Math.min(70, Math.abs(sx - tx) * 0.32 + 24);
  const midY = ty + dy / 2;
  const path =
    Math.abs(sx - tx) < 10
      ? `M ${sx} ${sy} L ${tx} ${ty}`
      : `M ${sx} ${sy} C ${sx} ${sy - curve}, ${tx} ${midY + curve}, ${tx} ${ty}`;

  return {
    ...edge,
    path,
    markerPath: arrowHead(tx, ty),
  };
}

function makeElkEdge(
  edge: GOEdge,
  nodesById: Map<string, PositionedNode>,
  layoutEdge: ElkLayoutEdge | undefined,
): PositionedEdge | null {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) {
    return null;
  }

  const section = layoutEdge?.sections?.[0];
  const points = [
    section?.startPoint,
    ...(section?.bendPoints ?? []),
    section?.endPoint,
  ].filter((point): point is ElkPoint => Boolean(point));

  if (points.length < 2) {
    return makeClassicEdge(edge, source, target);
  }

  const translated = points.map((point) => ({
    x: point.x,
    y: point.y,
  }));

  return {
    ...edge,
    path: toPolyline(translated),
    markerPath: arrowHead(translated[translated.length - 1].x, translated[translated.length - 1].y),
  };
}

function toPolyline(points: ElkPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function arrowHead(x: number, y: number): string {
  return `M ${x - 8} ${y + 12} L ${x} ${y} L ${x + 8} ${y + 12} Z`;
}
