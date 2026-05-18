import test from "node:test";
import assert from "node:assert/strict";

import { __exportFigureTest } from "../.test-build/exportFigure.js";

const { buildPdf, parseCssColor, pathDataToPdf, safeCanvasScale } = __exportFigureTest;

test("buildPdf creates a non-empty valid-looking PDF document", () => {
  const pdf = buildPdf("BT /F1 12 Tf 1 0 0 1 10 10 Tm (GONetView) Tj ET", 200, 100);
  const text = new TextDecoder().decode(pdf);

  assert.ok(pdf.byteLength > 500);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/MediaBox \[0 0 200 100\]/);
  assert.match(text, /xref/);
  assert.match(text, /%%EOF$/);
});

test("safeCanvasScale caps very large raster exports without shrinking normal exports", () => {
  assert.equal(safeCanvasScale(100, 100, 3), 3);
  assert.ok(safeCanvasScale(10000, 10000, 3) < 1);
  assert.ok(safeCanvasScale(0, 100, 3) === 3);
});

test("pathDataToPdf converts common SVG path commands", () => {
  const context = { pageHeight: 100, scale: 1 };
  const path = pathDataToPdf("M 10 20 L 30 40 H 50 V 60 Z", context, { x: 0, y: 0 });

  assert.match(path, /10 80 m/);
  assert.match(path, /30 60 l/);
  assert.match(path, /50 60 l/);
  assert.match(path, /50 40 l/);
  assert.match(path, /h/);
});

test("parseCssColor handles hex and translucent RGB colors", () => {
  assert.deepEqual(parseCssColor("#000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseCssColor("#ffffff"), { r: 1, g: 1, b: 1 });
  assert.deepEqual(parseCssColor("rgba(255, 0, 0, 0.5)"), { r: 1, g: 0.5, b: 0.5 });
  assert.equal(parseCssColor("none"), null);
});
