import test from "node:test";
import assert from "node:assert/strict";

const responses = new Map();

globalThis.fetch = async (url) => {
  const key = String(url);
  if (!responses.has(key)) {
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: `Missing fixture for ${key}` }),
    };
  }
  return {
    ok: true,
    json: async () => structuredClone(responses.get(key)),
  };
};

const { fetchFocusedGraph, fetchOrganisms, fetchStats, searchGenes, searchTerms } = await import("../.test-build/api.js");

test("api functions load static browser data and build relation-filtered GO graphs", async () => {
  loadApiFixtures();

  assert.deepEqual(await fetchStats(), {
    terms: 4,
    edges: 3,
    namespaces: ["biological_process"],
    maxAncestorDepth: 3,
    maxDescendantDepth: 3,
    dataVersion: "fixture-release",
    source: "go-basic.obo",
    generatedAt: "fixture-v1",
  });
  assert.deepEqual(await fetchOrganisms(), [{ key: "mini", label: "Mini organism", file: "data/annotations/mini/manifest.json", size: 1 }]);

  const graph = await fetchFocusedGraph("go", ["GO:0000002"], "mini", 1, 0, "", false, 20, false, ["part_of"]);

  assert.deepEqual(graph.selectedTerms, ["GO:0000002"]);
  assert.deepEqual(graph.nodes.map((node) => node.id), ["GO:0000001", "GO:0000002"]);
  assert.deepEqual(graph.edges, [{ source: "GO:0000002", target: "GO:0000001", relation: "part_of" }]);
  assert.equal(graph.nodes.find((node) => node.id === "GO:0000002")?.geneCount, 1);
});

test("api functions resolve gene aliases to GO terms", async () => {
  loadApiFixtures();

  assert.deepEqual((await searchTerms("GO:0000002", "", false)).map((term) => term.id), ["GO:0000002"]);
  assert.deepEqual((await searchGenes("GENEA", "mini")).map((gene) => gene.key), ["UniProtKB:P1"]);

  const graph = await fetchFocusedGraph("gene", ["GENEA"], "mini", 1, 0, "", false, 20, false, ["is_a"]);

  assert.deepEqual(graph.selectedGenes?.map((gene) => gene.key), ["UniProtKB:P1"]);
  assert.deepEqual(graph.selectedTerms, ["GO:0000003"]);
  assert.deepEqual(graph.nodes.map((node) => node.id), ["GO:0000002", "GO:0000003"]);
  assert.deepEqual(graph.edges, [{ source: "GO:0000003", target: "GO:0000002", relation: "is_a" }]);

  await assert.rejects(
    () => fetchFocusedGraph("gene", ["MISSING"], "mini", 1, 0, "", false, 20, false, ["is_a"]),
    /No genes matched Mini organism: MISSING/,
  );
  await assert.rejects(
    () => fetchFocusedGraph("gene", ["GENEB"], "mini", 1, 0, "", false, 20, false, ["is_a"]),
    /Genes were found but have no GO annotations in Mini organism: GENEB/,
  );
});

function loadApiFixtures() {
  responses.clear();
  responses.set("/data/go/manifest.json", {
    generatedAt: "fixture-v1",
    stats: {
      terms: 4,
      edges: 3,
      namespaces: ["biological_process"],
      maxAncestorDepth: 3,
      maxDescendantDepth: 3,
      dataVersion: "fixture-release",
      source: "go-basic.obo",
    },
    organisms: [{ key: "mini", label: "Mini organism", file: "data/annotations/mini/manifest.json", size: 1 }],
    files: {
      terms: "go/terms.json",
      termSearch: "go/term-search.json",
    },
  });
  responses.set("/data/go/terms.json", [
    rawTerm("GO:0000001", "root process", [], [], 0),
    rawTerm("GO:0000002", "child process", ["GO:0000001"], [["GO:0000001", "is_a"], ["GO:0000001", "part_of"]], 1),
    rawTerm("GO:0000003", "grandchild process", ["GO:0000002"], [["GO:0000002", "is_a"]], 2),
    { ...rawTerm("GO:0000004", "obsolete process", [], [], 0), obsolete: true },
  ]);
  responses.set("/data/go/term-search.json", [
    termSearch("GO:0000001", "root process", false),
    termSearch("GO:0000002", "child process", false),
    termSearch("GO:0000003", "grandchild process", false),
    termSearch("GO:0000004", "obsolete process", true),
  ]);
  responses.set("/data/annotations/mini/manifest.json", {
    organism: { key: "mini", label: "Mini organism", file: "data/annotations/mini/manifest.json", size: 1 },
    dateGenerated: "2026-05-18",
    generatedAt: "fixture-v1",
    files: {
      genes: "annotations/mini/genes.json",
      geneSearch: "annotations/mini/gene-search.json",
      termToGenes: "annotations/mini/term-to-genes.json",
      geneToTerms: "annotations/mini/gene-to-terms.json",
      aliases: "annotations/mini/aliases.json",
    },
  });
  responses.set("/data/annotations/mini/genes.json", [
    {
      key: "UniProtKB:P1",
      db: "UniProtKB",
      objectId: "P1",
      symbol: "GENEA",
      name: "Gene A",
      taxon: "taxon:9606",
      termCount: 1,
    },
    {
      key: "UniProtKB:P2",
      db: "UniProtKB",
      objectId: "P2",
      symbol: "GENEB",
      name: "Gene B",
      taxon: "taxon:9606",
      termCount: 0,
    },
  ]);
  responses.set("/data/annotations/mini/gene-search.json", [
    {
      key: "UniProtKB:P1",
      db: "UniProtKB",
      objectId: "P1",
      symbol: "GENEA",
      name: "Gene A",
      taxon: "taxon:9606",
      termCount: 1,
      search: "genea p1 uniprotkb:p1 gene a",
    },
    {
      key: "UniProtKB:P2",
      db: "UniProtKB",
      objectId: "P2",
      symbol: "GENEB",
      name: "Gene B",
      taxon: "taxon:9606",
      termCount: 0,
      search: "geneb p2 uniprotkb:p2 gene b",
    },
  ]);
  responses.set("/data/annotations/mini/term-to-genes.json", {
    "GO:0000002": ["UniProtKB:P1"],
    "GO:0000003": ["UniProtKB:P1"],
  });
  responses.set("/data/annotations/mini/gene-to-terms.json", {
    "UniProtKB:P1": ["GO:0000003"],
    "UniProtKB:P2": [],
  });
  responses.set("/data/annotations/mini/aliases.json", {
    GENEA: ["UniProtKB:P1"],
    GENEB: ["UniProtKB:P2"],
    P1: ["UniProtKB:P1"],
    P2: ["UniProtKB:P2"],
  });
}

function rawTerm(id, name, parents, relations, level) {
  return {
    id,
    name,
    namespace: "biological_process",
    definition: "",
    parents,
    relations,
    obsolete: false,
    level,
  };
}

function termSearch(id, name, obsolete) {
  return {
    id,
    name,
    namespace: "biological_process",
    definition: "",
    parentCount: 0,
    childCount: 0,
    level: 0,
    obsolete,
    search: `${id} ${id.replace(":", "")} ${name}`.toLowerCase(),
  };
}
