import test from "node:test";
import assert from "node:assert/strict";

import { findGraphSearchMatches, nextGraphSearchIndex } from "../.test-build/graphSearch.js";

function node(id, name, namespace, x, y) {
  return {
    id,
    name,
    namespace,
    definition: "",
    parentCount: 0,
    childCount: 0,
    level: 0,
    obsolete: false,
    x,
    y,
    width: 100,
    height: 70,
    rank: 0,
  };
}

test("findGraphSearchMatches searches id, name, and namespace in visual order", () => {
  const nodes = [
    node("GO:0000003", "cell death", "biological_process", 200, 90),
    node("GO:0000001", "apoptotic process", "biological_process", 100, 10),
    node("GO:0000002", "apoptosis regulator", "molecular_function", 20, 10),
  ];

  assert.deepEqual(
    findGraphSearchMatches(nodes, "apop").map((entry) => entry.id),
    ["GO:0000002", "GO:0000001"],
  );
  assert.deepEqual(
    findGraphSearchMatches(nodes, "molecular").map((entry) => entry.id),
    ["GO:0000002"],
  );
  assert.deepEqual(findGraphSearchMatches(nodes, "  "), []);
});

test("nextGraphSearchIndex wraps like browser find controls", () => {
  assert.equal(nextGraphSearchIndex(-1, 0, 1), -1);
  assert.equal(nextGraphSearchIndex(-1, 3, 1), 1);
  assert.equal(nextGraphSearchIndex(0, 3, -1), 2);
  assert.equal(nextGraphSearchIndex(2, 3, 1), 0);
});
