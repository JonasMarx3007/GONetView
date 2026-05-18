import test from "node:test";
import assert from "node:assert/strict";

import { layoutGraph, wrapName } from "../.test-build/layout.js";

function term(id, name, level) {
  return {
    id,
    name,
    namespace: "biological_process",
    definition: "",
    parentCount: 0,
    childCount: 0,
    level,
    obsolete: false,
  };
}

test("wrapName creates bounded readable node labels", () => {
  assert.deepEqual(wrapName("short label"), ["short label"]);
  const wrapped = wrapName("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen");
  assert.ok(wrapped.length <= 4);
  assert.ok(wrapped.every((line) => line.length > 0));
});

test("layoutGraph positions visible nodes and drops edges with missing nodes", () => {
  const result = layoutGraph(
    [term("GO:0000001", "root process", 0), term("GO:0000002", "child process", 1)],
    [
      { source: "GO:0000002", target: "GO:0000001", relation: "is_a" },
      { source: "GO:0000003", target: "GO:0000001", relation: "is_a" },
    ],
  );

  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.ok(result.width > 0);
  assert.ok(result.height >= 520);
  assert.match(result.edges[0].path, /^M /);
  assert.match(result.edges[0].markerPath, /^M /);
});
