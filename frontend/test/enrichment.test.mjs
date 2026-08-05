import test from "node:test";
import assert from "node:assert/strict";

const { benjaminiHochberg, calculateEnrichment, enrichmentCsv, hypergeometricSurvival, reduceRedundancy } = await import(
  "../.test-build/enrichment.js"
);

test("hypergeometricSurvival calculates a one-sided over-representation probability", () => {
  const probability = hypergeometricSurvival(3, 5, 7, 20);
  assert.ok(Math.abs(probability - 3206 / 15504) < 1e-12);
  assert.equal(hypergeometricSurvival(0, 5, 7, 20), 1);
  assert.equal(hypergeometricSurvival(6, 5, 7, 20), 0);
});

test("benjaminiHochberg preserves ordering and monotonic adjusted probabilities", () => {
  assert.deepEqual(benjaminiHochberg([0.01, 0.04, 0.03]), [0.03, 0.04, 0.04]);
});

test("calculateEnrichment includes zero-hit terms in multiple testing but not output", () => {
  const gene = geneRecord("P1", "GENEA");
  const { results, testedTerms } = calculateEnrichment(
    [
      candidate("GO:0000001", 2, 5, [gene]),
      candidate("GO:0000002", 1, 2, [gene]),
      candidate("GO:0000003", 0, 8, []),
    ],
    4,
    20,
  );

  assert.equal(testedTerms, 3);
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.adjustedPValue >= result.pValue));
  assert.equal(results.find((result) => result.term.id === "GO:0000001")?.expected, 1);
  assert.equal(results.find((result) => result.term.id === "GO:0000001")?.foldEnrichment, 2);
});

test("calculateEnrichment leaves terms outside the size range untested", () => {
  const gene = geneRecord("P1", "GENEA");
  const candidates = [
    candidate("GO:0000001", 1, 2, [gene]),
    candidate("GO:0000002", 1, 40, [gene]),
    candidate("GO:0000003", 1, 900, [gene]),
  ];

  const unfiltered = calculateEnrichment(candidates, 4, 1000);
  assert.equal(unfiltered.testedTerms, 3);

  const filtered = calculateEnrichment(candidates, 4, 1000, { minTermSize: 5, maxTermSize: 500 });
  assert.equal(filtered.testedTerms, 1);
  assert.deepEqual(filtered.results.map((result) => result.term.id), ["GO:0000002"]);

  // A cap of zero keeps the upper bound open.
  const noCap = calculateEnrichment(candidates, 4, 1000, { minTermSize: 5, maxTermSize: 0 });
  assert.equal(noCap.testedTerms, 2);

  // Dropping terms from the tested family relaxes the correction for those that remain.
  const keptTerm = (outcome) => outcome.results.find((result) => result.term.id === "GO:0000002");
  assert.ok(keptTerm(filtered).adjustedPValue < keptTerm(unfiltered).adjustedPValue);
  assert.equal(keptTerm(filtered).pValue, keptTerm(unfiltered).pValue);
});

test("calculateEnrichment corrects within each namespace separately", () => {
  const gene = geneRecord("P1", "GENEA");
  const candidates = [
    inNamespace(candidate("GO:0000001", 3, 6, [gene]), "biological_process"),
    inNamespace(candidate("GO:0000002", 2, 6, [gene]), "molecular_function"),
    inNamespace(candidate("GO:0000003", 1, 6, [gene]), "cellular_component"),
  ];

  const { results, testedTermsByNamespace } = calculateEnrichment(candidates, 4, 20);

  assert.deepEqual(testedTermsByNamespace, {
    biological_process: 1,
    molecular_function: 1,
    cellular_component: 1,
  });
  // One test per namespace family, so Benjamini-Hochberg leaves each probability untouched.
  assert.ok(results.every((result) => Math.abs(result.adjustedPValue - result.pValue) < 1e-12));

  const pooled = calculateEnrichment(
    candidates.map((entry) => inNamespace(entry, "biological_process")),
    4,
    20,
  );
  assert.deepEqual(pooled.testedTermsByNamespace, { biological_process: 3 });
  assert.ok(pooled.results.some((result) => result.adjustedPValue > result.pValue));
  for (const result of results) {
    const pooledResult = pooled.results.find((entry) => entry.term.id === result.term.id);
    assert.ok(pooledResult.adjustedPValue >= result.adjustedPValue);
  }
});

test("reduceRedundancy keeps the most significant term of a parent-child chain", () => {
  // GO:0000003 is a child of GO:0000002, which is a child of GO:0000001.
  const ancestors = {
    "GO:0000001": ["GO:0000001"],
    "GO:0000002": ["GO:0000002", "GO:0000001"],
    "GO:0000003": ["GO:0000003", "GO:0000002", "GO:0000001"],
  };
  const results = [
    outcome("GO:0000003", 1e-9, ["P1", "P2", "P3"]),
    outcome("GO:0000002", 1e-6, ["P1", "P2", "P3"]),
    outcome("GO:0000001", 1e-4, ["P1", "P2", "P3", "P4", "P5", "P6"]),
    outcome("GO:0000009", 1e-3, ["P7"]),
  ];

  const { kept, removed } = reduceRedundancy({
    results,
    ancestorsOf: (termId) => ancestors[termId] ?? [termId],
    fdrCutoff: 0.05,
    overlap: 0.9,
  });

  // The parent reporting the same three genes goes; the grandparent adds three more, so it stays.
  assert.deepEqual(kept.map((result) => result.term.id), ["GO:0000003", "GO:0000001", "GO:0000009"]);
  assert.equal(removed, 1);

  // An unrelated term on another branch is never compared away.
  assert.ok(kept.some((result) => result.term.id === "GO:0000009"));

  // Non-significant rows are left alone.
  const withNonSignificant = [...results, outcome("GO:0000004", 0.4, ["P1", "P2", "P3"])];
  const relaxed = reduceRedundancy({
    results: withNonSignificant,
    ancestorsOf: (termId) => ancestors[termId] ?? [termId],
    fdrCutoff: 0.05,
    overlap: 0.9,
  });
  assert.ok(relaxed.kept.some((result) => result.term.id === "GO:0000004"));
});

test("enrichmentCsv quotes labels and includes contributing genes", () => {
  const gene = geneRecord("P1", "GENEA");
  const { results } = calculateEnrichment([candidate("GO:0000001", 1, 1, [gene], 'alpha, "beta"')], 1, 10);
  const csv = enrichmentCsv(results);
  assert.match(csv, /"alpha, ""beta"""/);
  assert.match(csv, /GENEA/);
});

function candidate(id, observed, backgroundObserved, genes, name = "term") {
  return {
    term: {
      id,
      name,
      namespace: "biological_process",
      definition: "",
      parentCount: 0,
      childCount: 0,
      level: 0,
      obsolete: false,
    },
    observed,
    backgroundObserved,
    genes,
  };
}

function outcome(id, adjustedPValue, geneKeys) {
  return {
    term: { id, name: id, namespace: "biological_process" },
    observed: geneKeys.length,
    querySize: 10,
    backgroundObserved: geneKeys.length * 2,
    backgroundSize: 100,
    expected: 1,
    foldEnrichment: geneKeys.length,
    pValue: adjustedPValue,
    adjustedPValue,
    genes: geneKeys,
  };
}

function inNamespace(entry, namespace) {
  return { ...entry, term: { ...entry.term, namespace } };
}

function geneRecord(objectId, symbol) {
  return { key: `UniProtKB:${objectId}`, db: "UniProtKB", objectId, symbol, name: symbol, taxon: "taxon:9606", termCount: 1 };
}
