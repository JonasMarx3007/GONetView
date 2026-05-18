import { buildConnectionGraph } from "./graphConnections";
import type { ConnectionGraph } from "./graphConnections";
import type { GOEdge, GOTerm, GraphResponse } from "./types";

type WorkerRequest = {
  id: number;
  graph: GraphResponse;
  selectedTerms: string[];
  trim: boolean;
};

type ConnectionGraphPayload = {
  nodes: GOTerm[];
  edges: GOEdge[];
  edgeClasses: Array<[string, string]>;
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, graph, selectedTerms, trim } = event.data;
  const result = buildConnectionGraph(graph, selectedTerms, trim);
  const payload: ConnectionGraphPayload = {
    nodes: result.nodes,
    edges: result.edges,
    edgeClasses: [...result.edgeClasses.entries()],
  };
  self.postMessage({ id, payload });
};
