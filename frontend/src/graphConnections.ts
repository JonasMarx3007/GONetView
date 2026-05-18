import type { GOEdge, GOTerm, GraphResponse } from "./types";

export type ConnectionGraph = {
  nodes: GOTerm[];
  edges: GOEdge[];
  edgeClasses: Map<string, string>;
};

export function buildConnectionGraph(graph: GraphResponse, selectedTerms: string[], trim: boolean): ConnectionGraph {
  const selectedSet = new Set(selectedTerms);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const directSelectedEdges = new Set<string>();

  for (const edge of visibleEdges) {
    if (selectedSet.has(edge.source) && selectedSet.has(edge.target)) {
      directSelectedEdges.add(edgeKey(edge.source, edge.target, edge.relation));
    }
  }

  const connectorEdges = selectedSet.size > 1 ? collectShortestPathEdges(graph.nodes, visibleEdges, selectedSet) : new Set<string>();
  const edgeClasses = new Map<string, string>();

  for (const edge of visibleEdges) {
    const key = edgeKey(edge.source, edge.target, edge.relation);
    if (directSelectedEdges.has(key)) {
      edgeClasses.set(key, "selected-edge");
    } else if (connectorEdges.has(key)) {
      edgeClasses.set(key, "indirect-edge");
    }
  }

  if (!trim) {
    return {
      nodes: graph.nodes,
      edges: visibleEdges,
      edgeClasses,
    };
  }

  const keptNodeIds = new Set<string>();
  for (const id of selectedSet) {
    if (nodeIds.has(id)) {
      keptNodeIds.add(id);
    }
  }
  for (const edge of visibleEdges) {
    if (connectorEdges.has(edgeKey(edge.source, edge.target, edge.relation))) {
      keptNodeIds.add(edge.source);
      keptNodeIds.add(edge.target);
    }
  }

  const trimmedEdges = visibleEdges.filter((edge) => connectorEdges.has(edgeKey(edge.source, edge.target, edge.relation)));
  const trimmedEdgeClasses = new Map<string, string>();
  for (const edge of trimmedEdges) {
    const key = edgeKey(edge.source, edge.target, edge.relation);
    const edgeClass = edgeClasses.get(key);
    if (edgeClass) {
      trimmedEdgeClasses.set(key, edgeClass);
    }
  }

  return {
    nodes: graph.nodes.filter((node) => keptNodeIds.has(node.id)),
    edges: trimmedEdges,
    edgeClasses: trimmedEdgeClasses,
  };
}

export function edgeKey(source: string, target: string, relation: string): string {
  return `${source}->${target}:${relation}`;
}

function collectShortestPathEdges(nodes: GOTerm[], edges: GOEdge[], selectedSet: Set<string>): Set<string> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const selectedIds = [...selectedSet].filter((id) => nodeIds.has(id)).sort();
  const connectorEdges = new Set<string>();

  for (let startIndex = 0; startIndex < selectedIds.length; startIndex += 1) {
    const startId = selectedIds[startIndex];
    const distFromStart = shortestDistances(startId, adjacency);

    for (let targetIndex = startIndex + 1; targetIndex < selectedIds.length; targetIndex += 1) {
      const targetId = selectedIds[targetIndex];
      const shortestDistance = distFromStart.get(targetId);
      if (shortestDistance === undefined || shortestDistance < 1) {
        continue;
      }

      const distFromTarget = shortestDistances(targetId, adjacency);
      for (const edge of edges) {
        const forward = edgeOnShortestPath(edge.source, edge.target, distFromStart, distFromTarget, shortestDistance);
        const backward = edgeOnShortestPath(edge.target, edge.source, distFromStart, distFromTarget, shortestDistance);
        if (forward || backward) {
          connectorEdges.add(edgeKey(edge.source, edge.target, edge.relation));
        }
      }
    }
  }

  return connectorEdges;
}

function shortestDistances(startId: string, adjacency: Map<string, string[]>): Map<string, number> {
  const distances = new Map<string, number>([[startId, 0]]);
  const queue = [startId];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentDistance = distances.get(current) ?? 0;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) {
        continue;
      }
      distances.set(neighbor, currentDistance + 1);
      queue.push(neighbor);
    }
  }

  return distances;
}

function edgeOnShortestPath(
  from: string,
  to: string,
  distFromStart: Map<string, number>,
  distFromTarget: Map<string, number>,
  shortestDistance: number,
): boolean {
  const startDistance = distFromStart.get(from);
  const nextDistance = distFromStart.get(to);
  const targetDistance = distFromTarget.get(to);
  if (startDistance === undefined || nextDistance === undefined || targetDistance === undefined) {
    return false;
  }
  return nextDistance === startDistance + 1 && startDistance + 1 + targetDistance === shortestDistance;
}
