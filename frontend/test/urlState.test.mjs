import test from "node:test";
import assert from "node:assert/strict";

import { readUrlState, serializeUrlState, writeUrlState } from "../.test-build/urlState.js";

test("readUrlState parses supported query parameters", () => {
  setWindow("?mode=gene&q=TP53&org=goa_human&ns=biological_process&anc=2&desc=3&random=1&child=12&obsolete=true&rel=is_a,part_of&layout=classic&trim=1&legend=0&fit=width&find=apop");

  assert.deepEqual(readUrlState(), {
    inputMode: "gene",
    query: "TP53",
    organism: "goa_human",
    namespace: "biological_process",
    ancestors: 2,
    descendants: 3,
    randomChildLimit: true,
    childLimit: 12,
    includeObsolete: true,
    selectedRelations: ["is_a", "part_of"],
    layoutMode: "classic",
    trimConnections: true,
    showLegend: false,
    fitMode: "width",
    graphSearch: "apop",
  });
});

test("writeUrlState writes compact browser URL state", () => {
  const calls = setWindow("");

  writeUrlState({
    inputMode: "go",
    query: "GO:0006915",
    organism: "goa_human",
    ancestors: 1,
    descendants: 0,
    selectedRelations: ["is_a", "part_of"],
    layoutMode: "readable",
    trimConnections: false,
    showLegend: true,
    fitMode: "height",
    graphSearch: "death",
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0],
    "/GONetView/?mode=go&q=GO%3A0006915&org=goa_human&anc=1&desc=0&rel=is_a%2Cpart_of&layout=readable&trim=0&legend=1&fit=height&find=death#graph",
  );
});

test("serializeUrlState returns the same stable query format without touching history", () => {
  assert.equal(
    serializeUrlState({
      inputMode: "gene",
      query: "CD8A",
      organism: "goa_human",
      namespace: "biological_process",
      ancestors: 10,
      descendants: 0,
      selectedRelations: ["is_a", "part_of"],
      layoutMode: "readable",
      trimConnections: true,
      showLegend: true,
      fitMode: "height",
    }),
    "mode=gene&q=CD8A&org=goa_human&ns=biological_process&anc=10&desc=0&rel=is_a%2Cpart_of&layout=readable&trim=1&legend=1&fit=height",
  );
});

function setWindow(search) {
  const calls = [];
  globalThis.window = {
    location: {
      pathname: "/GONetView/",
      search,
      hash: "#graph",
    },
    history: {
      replaceState: (_state, _title, url) => calls.push(url),
    },
  };
  return calls;
}
