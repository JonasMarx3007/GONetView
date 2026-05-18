import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const port = 4180;
const serverUrl = `http://127.0.0.1:${port}`;
const screenshotDir = new URL("../../docs/assets/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../public/data/go/manifest.json", import.meta.url), "utf8"));
const tutorialAncestorDepth = Math.min(10, manifest.stats?.maxAncestorDepth ?? 10);
const tutorialRelations = "is_a,part_of,regulates,positively_regulates,negatively_regulates";
const goQuery = new URLSearchParams({
  mode: "go",
  q: "GO:0050852\nGO:0002456\nGO:0045065",
  org: "goa_human",
  ns: "biological_process",
  anc: String(tutorialAncestorDepth),
  desc: "0",
  rel: tutorialRelations,
  layout: "readable",
  fit: "height",
  legend: "1",
  trim: "1",
});
const geneQuery = new URLSearchParams({
  mode: "gene",
  q: "CD8A",
  org: "goa_human",
  ns: "biological_process",
  anc: String(tutorialAncestorDepth),
  desc: "0",
  rel: tutorialRelations,
  layout: "readable",
  fit: "height",
  legend: "1",
  trim: "1",
});

await mkdir(screenshotDir, { recursive: true });

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

let browser;
try {
  await waitForServer(serverUrl, 30_000);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
  await page.goto(`${serverUrl}/?${goQuery.toString()}`, { waitUntil: "networkidle" });
  await page.locator("svg.go-graph .go-node").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: fileURLToPath(new URL("gonetview-overview.png", screenshotDir)), fullPage: true });
  await page.locator(".term-detail").screenshot({ path: fileURLToPath(new URL("gonetview-term-detail.png", screenshotDir)) });

  await page.getByPlaceholder("GO ID or term name").fill("activation");
  await page.locator(".go-node.search-hit").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.screenshot({ path: fileURLToPath(new URL("gonetview-graph-search.png", screenshotDir)), fullPage: true });

  await page.goto(`${serverUrl}/?${geneQuery.toString()}`, { waitUntil: "networkidle" });
  await page.locator("svg.go-graph .go-node").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: fileURLToPath(new URL("gonetview-gene-mode.png", screenshotDir)), fullPage: true });
} finally {
  await browser?.close();
  server.kill();
}

async function waitForServer(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite accepts connections.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
