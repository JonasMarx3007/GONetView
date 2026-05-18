import test from "node:test";
import assert from "node:assert/strict";

import { buildConnectionGraph, edgeKey } from "../.test-build/graphConnections.js";

function term(id) {
  return {
    id,
    name: id,
    namespace: "biological_process",
    definition: "",
    parentCount: 0,
    childCount: 0,
    level: 0,
    obsolete: false,
  };
}

function graph(nodes, edges) {
  return {
    selected: "",
    selectedTerms: [],
    truncated: false,
    maxAncestorDepth: 0,
    maxDescendantDepth: 0,
    nodes,
    edges,
  };
}

test("buildConnectionGraph trims to shortest connectors between selected terms", () => {
  const response = graph(
    [term("A"), term("B"), term("C"), term("D")],
    [
      { source: "A", target: "B", relation: "is_a" },
      { source: "B", target: "C", relation: "part_of" },
      { source: "C", target: "D", relation: "is_a" },
    ],
  );

  const result = buildConnectionGraph(response, ["A", "C"], true);

  assert.deepEqual(result.nodes.map((node) => node.id), ["A", "B", "C"]);
  assert.deepEqual(
    result.edges.map((edge) => edgeKey(edge.source, edge.target, edge.relation)),
    [edgeKey("A", "B", "is_a"), edgeKey("B", "C", "part_of")],
  );
  assert.equal(result.edgeClasses.get(edgeKey("A", "B", "is_a")), "indirect-edge");
  assert.equal(result.edgeClasses.get(edgeKey("B", "C", "part_of")), "indirect-edge");
});

test("buildConnectionGraph marks direct selected edges", () => {
  const response = graph(
    [term("A"), term("B")],
    [{ source: "A", target: "B", relation: "is_a" }],
  );

  const result = buildConnectionGraph(response, ["A", "B"], false);

  assert.equal(result.edgeClasses.get(edgeKey("A", "B", "is_a")), "selected-edge");
});
