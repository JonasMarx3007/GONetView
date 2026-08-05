import { expect, test } from "@playwright/test";

test("loads a focused GO graph and exposes details, search, and export controls", async ({ page }) => {
  await routeFixtureData(page);

  await page.goto("/?q=GO%3A0000002&org=mini&anc=1&desc=0&layout=classic&fit=height");

  await expect(page.getByRole("heading", { name: "GONetView" })).toBeVisible();
  await expect(page.locator("svg.go-graph")).toBeVisible();
  await expect(page.locator(".go-node", { hasText: "GO:0000002" })).toBeVisible();
  await expect(page.locator(".term-detail h2")).toHaveText("GO:0000002");
  await expect(page.locator(".term-detail h3")).toHaveText("child process");

  await page.getByPlaceholder("GO ID or term name").fill("root");
  await expect(page.locator(".find-count")).toHaveText("1/1");
  await expect(page.locator(".go-node.search-hit", { hasText: "GO:0000001" })).toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("button", { name: /PNG/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /SVG/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /PDF/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /JSON/ })).toBeVisible();
});

test("runs enrichment from its own gene list without disturbing the graph query", async ({ page }) => {
  await routeFixtureData(page);
  await page.goto("/?q=GO%3A0000002&org=mini&anc=1&desc=0&layout=classic&fit=height");

  await page.getByPlaceholder("TP53, BRCA1, ATM").fill("GENEA");
  // The fixture ontology is tiny, so widen the tested term-size range past its defaults.
  await page.getByLabel("Smallest term").fill("1");
  await page.getByLabel("Largest term").fill("0");
  await page.getByRole("button", { name: "Run enrichment" }).click();

  await expect(page.getByRole("region", { name: "GO enrichment results" })).toBeVisible();
  await expect(page.getByText(/1 query genes/)).toBeVisible();

  // The qualitative graph pipeline stays on its own GO query.
  await expect(page.getByPlaceholder("GO:0019319\nGO:0046364")).toHaveValue("GO:0000002");
  await expect(page.locator(".go-node", { hasText: "GO:0000002" })).toBeVisible();

  // Editing the graph query keeps the enrichment result instead of discarding it.
  await page.getByPlaceholder("GO:0019319\nGO:0046364").fill("GO:0000003");
  await expect(page.getByRole("region", { name: "GO enrichment results" })).toBeVisible();

  await page.getByLabel("Maximum FDR").fill("1");
  await expect(page.locator(".enrichment-table tbody tr")).toHaveCount(2);
});

test("maps selected enrichment terms as a graph state the URL reproduces", async ({ page }) => {
  await routeFixtureData(page);
  await page.goto("/?q=GO%3A0000001&org=mini&anc=1&desc=0&layout=classic&fit=height");

  await page.getByPlaceholder("TP53, BRCA1, ATM").fill("GENEA");
  // The fixture ontology is tiny, so widen the tested term-size range past its defaults.
  await page.getByLabel("Smallest term").fill("1");
  await page.getByLabel("Largest term").fill("0");
  await page.getByRole("button", { name: "Run enrichment" }).click();
  await expect(page.getByRole("region", { name: "GO enrichment results" })).toBeVisible();

  await page.getByLabel("Maximum FDR").fill("1");
  await page.getByLabel("Select GO:0000002").check();
  await page.getByRole("button", { name: /Map selected \(1\)/ }).click();

  await expect(page.locator(".go-node", { hasText: "GO:0000002" })).toBeVisible();
  await expect(page.getByPlaceholder("GO:0019319\nGO:0046364")).toHaveValue("GO:0000002");
  await expect(page).toHaveURL(/q=GO%3A0000002/);

  // Changing a scope control keeps the mapped terms instead of reverting to the previous query.
  await page.getByLabel("Include obsolete terms").check();
  await expect(page.locator(".go-node", { hasText: "GO:0000002" })).toBeVisible();
  await expect(page.getByPlaceholder("GO:0019319\nGO:0046364")).toHaveValue("GO:0000002");
});

async function routeFixtureData(page: import("@playwright/test").Page): Promise<void> {
  const fixtures = new Map<string, unknown>([
    [
      "/data/go/manifest.json",
      {
        generatedAt: "fixture-v1",
        stats: {
          terms: 3,
          edges: 2,
          namespaces: ["biological_process"],
          maxAncestorDepth: 2,
          maxDescendantDepth: 2,
          dataVersion: "fixture-release",
          source: "go-basic.obo",
        },
        organisms: [{ key: "mini", label: "Mini organism", file: "data/annotations/mini/manifest.json", size: 1 }],
        files: {
          terms: "go/terms.json",
          termSearch: "go/term-search.json",
        },
      },
    ],
    [
      "/data/go/terms.json",
      [
        rawTerm("GO:0000001", "root process", [], [], 0),
        rawTerm("GO:0000002", "child process", ["GO:0000001"], [["GO:0000001", "is_a"]], 1),
        rawTerm("GO:0000003", "sibling process", ["GO:0000001"], [["GO:0000001", "is_a"]], 1),
      ],
    ],
    [
      "/data/go/term-search.json",
      [
        termSearch("GO:0000001", "root process"),
        termSearch("GO:0000002", "child process"),
        termSearch("GO:0000003", "sibling process"),
      ],
    ],
    [
      "/data/annotations/mini/manifest.json",
      {
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
      },
    ],
    [
      "/data/annotations/mini/genes.json",
      [
        {
          key: "UniProtKB:P1",
          db: "UniProtKB",
          objectId: "P1",
          symbol: "GENEA",
          name: "Gene A",
          taxon: "taxon:9606",
          termCount: 1,
        },
      ],
    ],
    [
      "/data/annotations/mini/gene-search.json",
      [
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
      ],
    ],
    ["/data/annotations/mini/term-to-genes.json", { "GO:0000002": ["UniProtKB:P1"] }],
    ["/data/annotations/mini/gene-to-terms.json", { "UniProtKB:P1": ["GO:0000002"] }],
    ["/data/annotations/mini/aliases.json", { GENEA: ["UniProtKB:P1"], P1: ["UniProtKB:P1"] }],
  ]);

  await page.route("**/data/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const payload = fixtures.get(requestUrl.pathname);
    if (payload === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: requestUrl.pathname }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

function rawTerm(id: string, name: string, parents: string[], relations: Array<[string, string]>, level: number): unknown {
  return {
    id,
    name,
    namespace: "biological_process",
    definition: `${name} definition.`,
    parents,
    relations,
    obsolete: false,
    level,
  };
}

function termSearch(id: string, name: string): unknown {
  return {
    id,
    name,
    namespace: "biological_process",
    definition: `${name} definition.`,
    parentCount: 0,
    childCount: 0,
    level: 0,
    obsolete: false,
    search: `${id} ${id.replace(":", "")} ${name}`.toLowerCase(),
  };
}
