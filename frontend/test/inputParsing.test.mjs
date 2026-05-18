import test from "node:test";
import assert from "node:assert/strict";

import {
  activeSearchToken,
  isAutoRefreshInputReady,
  parseGenes,
  parseTerms,
  replaceActiveSearchToken,
} from "../.test-build/inputParsing.js";

test("parseTerms normalizes GO identifiers and removes duplicates", () => {
  assert.deepEqual(parseTerms("go:0006915, GO0006915\nGO:0008219"), ["GO:0006915", "GO:0008219"]);
});

test("parseGenes splits common separators and preserves first occurrence order", () => {
  assert.deepEqual(parseGenes("TP53; BRCA1,TP53\nEGFR"), ["TP53", "BRCA1", "EGFR"]);
});

test("active token helpers support autocomplete replacement", () => {
  assert.equal(activeSearchToken("GO:0006915 TP"), "TP");
  assert.equal(replaceActiveSearchToken("GO:0006915 TP", "TP53"), "GO:0006915 TP53");
  assert.equal(replaceActiveSearchToken("", "GO:0006915"), "GO:0006915");
});

test("auto refresh waits for incomplete GO identifiers", () => {
  assert.equal(isAutoRefreshInputReady("go", "GO:00069"), false);
  assert.equal(isAutoRefreshInputReady("go", "GO:0006915"), true);
  assert.equal(isAutoRefreshInputReady("gene", "T"), false);
  assert.equal(isAutoRefreshInputReady("gene", "TP"), true);
});
