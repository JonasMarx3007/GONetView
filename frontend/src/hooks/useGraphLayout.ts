import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { buildConnectionGraph, type ConnectionGraph } from "../graphConnections";
import { layoutGraph, layoutReadableGraph, type LayoutGraph, type LayoutMode, type ReadableLayoutProfile } from "../layout";
import type { GOEdge, GOTerm, GraphResponse } from "../types";
import { formatCount } from "../formatNumber";

// Readable layout runs in a worker, so the ceiling is the wait a user will tolerate rather
// than a frozen tab. Measured on real GO graphs: the fast profile lays out 901 nodes in about
// 9 s and 1,122 nodes in roughly 20 s, so the limit sits just past the larger of those.
const READABLE_LAYOUT_NODE_LIMIT = 1200;
const READABLE_LAYOUT_EDGE_LIMIT = 1800;
const READABLE_LAYOUT_COMPLEXITY_LIMIT = 2200000;
// Above this size the quality profile costs minutes, so the faster placement is used instead.
const FAST_LAYOUT_NODE_THRESHOLD = 520;
const FAST_LAYOUT_EDGE_THRESHOLD = 620;
const READABLE_LAYOUT_TIMEOUT_MS = 45000;

type UseGraphLayoutArgs = {
  graph: GraphResponse | null;
  selectedTerms: string[];
  trimConnections: boolean;
  layoutMode: LayoutMode;
};

export function useGraphLayout({ graph, selectedTerms, trimConnections, layoutMode }: UseGraphLayoutArgs) {
  const [connectionGraph, setConnectionGraph] = useState<ConnectionGraph | null>(null);
  const [laidOut, setLaidOut] = useState<LayoutGraph | null>(null);
  const [buildingConnections, setBuildingConnections] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const [layoutNotice, setLayoutNotice] = useState("");
  const connectionWorkerRef = useRef<Worker | null>(null);
  const connectionRequestRef = useRef(0);

  const invalidateLayoutRequests = useCallback(() => {
    connectionRequestRef.current += 1;
  }, []);

  const clearGraphLayout = useCallback(() => {
    invalidateLayoutRequests();
    setBuildingConnections(false);
    setLayouting(false);
    setConnectionGraph(null);
    setLaidOut(null);
  }, [invalidateLayoutRequests]);

  useEffect(() => {
    if (!graph) {
      setConnectionGraph(null);
      setBuildingConnections(false);
      return;
    }

    const requestId = connectionRequestRef.current + 1;
    connectionRequestRef.current = requestId;
    setBuildingConnections(true);
    setLayouting(false);
    setConnectionGraph(null);
    setLaidOut(null);

    try {
      connectionWorkerRef.current ??= new Worker(new URL("../connectionWorker.ts", import.meta.url), { type: "module" });
      const worker = connectionWorkerRef.current;
      worker.onmessage = (event: MessageEvent<{ id: number; payload: { nodes: GOTerm[]; edges: GOEdge[]; edgeClasses: Array<[string, string]> } }>) => {
        if (event.data.id !== connectionRequestRef.current) {
          return;
        }
        setLaidOut(null);
        setConnectionGraph({
          nodes: event.data.payload.nodes,
          edges: event.data.payload.edges,
          edgeClasses: new Map(event.data.payload.edgeClasses),
        });
        setLayouting(true);
        setBuildingConnections(false);
      };
      worker.onerror = () => {
        if (requestId !== connectionRequestRef.current) {
          return;
        }
        setLaidOut(null);
        setConnectionGraph(buildConnectionGraph(graph, selectedTerms, trimConnections));
        setLayouting(true);
        setBuildingConnections(false);
      };
      worker.postMessage({ id: requestId, graph, selectedTerms, trim: trimConnections });
    } catch {
      setLaidOut(null);
      setConnectionGraph(buildConnectionGraph(graph, selectedTerms, trimConnections));
      setLayouting(true);
      setBuildingConnections(false);
    }
  }, [graph, selectedTerms, trimConnections]);

  useEffect(() => {
    return () => connectionWorkerRef.current?.terminate();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!connectionGraph) {
      setLaidOut(null);
      setLayouting(false);
      setLayoutNotice("");
      return;
    }

    if (layoutMode === "classic") {
      setLayoutNotice("");
      const result = layoutGraph(connectionGraph.nodes, connectionGraph.edges);
      if (!cancelled) {
        setLaidOut(result);
        setLayouting(false);
      }
      return () => {
        cancelled = true;
      };
    }

    const readableFallbackReason = readableLayoutFallbackReason(connectionGraph);
    if (readableFallbackReason) {
      setLayoutNotice(readableFallbackReason);
      const result = layoutGraph(connectionGraph.nodes, connectionGraph.edges);
      if (!cancelled) {
        setLaidOut(result);
        setLayouting(false);
      }
      return () => {
        cancelled = true;
      };
    }

    const profile = readableLayoutProfile(connectionGraph);
    const preview = layoutGraph(connectionGraph.nodes, connectionGraph.edges);
    setLaidOut(preview);
    setLayouting(true);
    setLayoutNotice(
      profile === "fast"
        ? `Readable layout is being prepared for ${formatCount(connectionGraph.nodes.length)} nodes using faster node placement, which allows more crossings; showing a quick preview until it is ready.`
        : "Readable layout is being prepared; showing a fast preview until it is ready.",
    );
    withTimeout(
      layoutReadableGraph(connectionGraph.nodes, connectionGraph.edges, profile),
      READABLE_LAYOUT_TIMEOUT_MS,
      "Readable layout took too long, so GONetView switched to classic for this graph.",
    )
      .then((result) => {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setLaidOut(result);
          setLayouting(false);
          setLayoutNotice("");
        });
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setLayoutNotice(err.message);
        const result = layoutGraph(connectionGraph.nodes, connectionGraph.edges);
        startTransition(() => {
          setLaidOut(result);
          setLayouting(false);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [connectionGraph, layoutMode]);

  return {
    connectionGraph,
    laidOut,
    buildingConnections,
    layouting,
    layoutNotice,
    setLayoutNotice,
    clearGraphLayout,
    invalidateLayoutRequests,
  };
}

function readableLayoutProfile(graph: ConnectionGraph): ReadableLayoutProfile {
  return graph.nodes.length > FAST_LAYOUT_NODE_THRESHOLD || graph.edges.length > FAST_LAYOUT_EDGE_THRESHOLD
    ? "fast"
    : "quality";
}

function readableLayoutFallbackReason(graph: ConnectionGraph): string {
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const complexity = nodeCount * edgeCount;
  if (
    nodeCount <= READABLE_LAYOUT_NODE_LIMIT &&
    edgeCount <= READABLE_LAYOUT_EDGE_LIMIT &&
    complexity <= READABLE_LAYOUT_COMPLEXITY_LIMIT
  ) {
    return "";
  }
  // Ordered by how much each control actually shrinks a dense gene-mode graph.
  return `Readable layout skipped for ${formatCount(nodeCount)} nodes and ${formatCount(edgeCount)} edges; classic layout is shown to keep the browser responsive. Try a single namespace, a lower ancestor or child depth, fewer inputs, or Trim to selected paths.`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}
