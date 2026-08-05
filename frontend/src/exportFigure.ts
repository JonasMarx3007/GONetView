import { NAMESPACE_STYLES, namespaceClass, relationClass, RELATION_STYLES } from "./theme";

export type ExportFormat = "png" | "svg" | "pdf";

const MAX_EXPORT_CANVAS_DIMENSION = 8192;
const MAX_EXPORT_CANVAS_PIXELS = 16_000_000;
const MAX_VECTOR_PDF_PAGE_WIDTH = 1440;
const MAX_VECTOR_PDF_PAGE_DIMENSION = 14400;

export async function exportFigure(svg: SVGSVGElement | null, format: ExportFormat) {
  if (!svg) {
    return;
  }
  const fileBase = `GONetView-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (format === "svg") {
    downloadBlob(new Blob([serializeFigureSvg(svg)], { type: "image/svg+xml;charset=utf-8" }), `${fileBase}.svg`);
    return;
  }

  if (format === "pdf") {
    const pdf = buildVectorPdf(svg);
    const pdfBuffer = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(pdfBuffer).set(pdf);
    downloadBlob(new Blob([pdfBuffer], { type: "application/pdf" }), `${fileBase}.pdf`);
    return;
  }

  const canvas = await renderSvgToCanvas(svg, 3);
  if (format === "png") {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${fileBase}.png`);
      }
    }, "image/png");
    return;
  }
}

export function exportMetadataJson(metadata: unknown) {
  const fileBase = `GONetView-metadata-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const json = JSON.stringify(metadata, null, 2);
  downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), `${fileBase}.json`);
}

export function exportEnrichmentCsv(csv: string, organismKey: string) {
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `gonetview-enrichment-${organismKey}.csv`);
}

function serializeFigureSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svgDimensions(svg);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .go-graph { background: #ffffff; }
    .edges path { fill: none; stroke: #4f5b66; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .edges .arrow-head { fill: #4f5b66; stroke: none; }
    .edges .indirect-edge path { stroke-width: 4.5; }
    .edges .selected-edge path { stroke-width: 6.4; }
    ${relationExportStyles()}
    .go-node .body { fill: #ffffff; stroke: #101010; stroke-width: 2.2; }
    .go-node.selected .body { fill: #ffffcc; stroke: #cfb437; stroke-width: 3.2; }
    .go-node.search-hit .body { stroke: #0a7894; stroke-width: 4.2; }
    .go-node.obsolete .body { stroke: #c42828; stroke-width: 2.8; }
    .go-node.obsolete.selected .body { stroke: #c42828; stroke-width: 3.2; }
    .go-node .header { fill: #7c8792; }
    ${namespaceExportStyles()}
    .go-node .id { fill: #ffffff; font-size: 18px; font-weight: 600; text-anchor: middle; dominant-baseline: middle; }
    .go-node .name { fill: #1c242a; font-size: 18px; font-weight: 500; text-anchor: middle; dominant-baseline: middle; }
  `;
  clone.insertBefore(style, clone.firstChild);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function relationExportStyles(): string {
  return RELATION_STYLES.map(
    (relation) =>
      `.edges .${relationClass(relation.key)} path { stroke: ${relation.color}; }\n` +
      `.edges .${relationClass(relation.key)} .arrow-head { fill: ${relation.color}; }\n` +
      (relation.dashed ? `.edges .${relationClass(relation.key)} path { stroke-dasharray: 6 4; }` : ""),
  ).join("\n");
}

function namespaceExportStyles(): string {
  return Object.entries(NAMESPACE_STYLES)
    .map(
      ([namespace, style]) =>
        `.go-node.${namespaceClass(namespace)} .body { fill: ${style.body}; }\n` +
        `.go-node.${namespaceClass(namespace)} .header { fill: ${style.header}; }`,
    )
    .join("\n");
}

function svgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return { width: Math.ceil(viewBox.width), height: Math.ceil(viewBox.height) };
  }
  return {
    width: Math.ceil(svg.getBoundingClientRect().width || 1200),
    height: Math.ceil(svg.getBoundingClientRect().height || 800),
  };
}

function renderSvgToCanvas(svg: SVGSVGElement, scale: number): Promise<HTMLCanvasElement> {
  const markup = serializeFigureSvg(svg);
  const { width, height } = svgDimensions(svg);
  const safeScale = safeCanvasScale(width, height, scale);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * safeScale));
      canvas.height = Math.max(1, Math.round(height * safeScale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not create export canvas"));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not render SVG export"));
    };
    image.src = url;
  });
}

function safeCanvasScale(width: number, height: number, requestedScale: number): number {
  if (width <= 0 || height <= 0) {
    return requestedScale;
  }
  const maxByDimension = Math.min(MAX_EXPORT_CANVAS_DIMENSION / width, MAX_EXPORT_CANVAS_DIMENSION / height);
  const maxByArea = Math.sqrt(MAX_EXPORT_CANVAS_PIXELS / (width * height));
  return Math.max(1 / Math.max(width, height), Math.min(requestedScale, maxByDimension, maxByArea));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

type PdfPoint = {
  x: number;
  y: number;
};

type PdfColor = {
  r: number;
  g: number;
  b: number;
};

type PdfRenderContext = {
  pageHeight: number;
  scale: number;
};

function buildVectorPdf(svg: SVGSVGElement): Uint8Array {
  const { width, height } = svgDimensions(svg);
  const scale = Math.min(
    MAX_VECTOR_PDF_PAGE_WIDTH / Math.max(1, width),
    MAX_VECTOR_PDF_PAGE_DIMENSION / Math.max(1, height),
    width < 240 ? 240 / Math.max(1, width) : 1,
  );
  const pageWidth = width * scale;
  const pageHeight = height * scale;
  const context = { pageHeight, scale };
  const content = [
    "1 1 1 rg",
    `0 0 ${fmt(pageWidth)} ${fmt(pageHeight)} re f`,
    renderSvgChildren(svg, context, { x: 0, y: 0 }),
  ].join("\n");
  return buildPdf(content, pageWidth, pageHeight);
}

function renderSvgChildren(parent: Element, context: PdfRenderContext, offset: PdfPoint): string {
  return Array.from(parent.children)
    .map((child) => renderSvgElement(child, context, offset))
    .filter(Boolean)
    .join("\n");
}

function renderSvgElement(element: Element, context: PdfRenderContext, offset: PdfPoint): string {
  const tag = element.tagName.toLowerCase();
  if (tag === "style") {
    return "";
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return "";
  }

  const nextOffset = addTranslate(offset, element.getAttribute("transform"));
  if (tag === "g" || tag === "svg") {
    return renderSvgChildren(element, context, nextOffset);
  }
  if (tag === "rect") {
    return renderRect(element as SVGRectElement, style, context, nextOffset);
  }
  if (tag === "path") {
    return renderPath(element.getAttribute("d") ?? "", style, context, nextOffset);
  }
  if (tag === "line") {
    return renderLine(element as SVGLineElement, style, context, nextOffset);
  }
  if (tag === "text") {
    return renderText(element as SVGTextElement, style, context, nextOffset);
  }
  return "";
}

function renderRect(element: SVGRectElement, style: CSSStyleDeclaration, context: PdfRenderContext, offset: PdfPoint): string {
  const x = numberAttr(element, "x");
  const y = numberAttr(element, "y");
  const width = numberAttr(element, "width");
  const height = numberAttr(element, "height");
  if (width <= 0 || height <= 0) {
    return "";
  }

  const fill = parseCssColor(style.fill);
  const stroke = parseCssColor(style.stroke);
  const strokeWidth = parseFloat(style.strokeWidth || "0") || 0;
  const commands = [
    paintCommands(fill, stroke, strokeWidth, style.strokeDasharray, context.scale),
    `${fmt((x + offset.x) * context.scale)} ${fmt(context.pageHeight - (y + offset.y + height) * context.scale)} ${fmt(width * context.scale)} ${fmt(height * context.scale)} re`,
    paintOperator(fill, stroke, strokeWidth),
  ];
  return scoped(commands);
}

function renderLine(element: SVGLineElement, style: CSSStyleDeclaration, context: PdfRenderContext, offset: PdfPoint): string {
  const stroke = parseCssColor(style.stroke);
  const strokeWidth = parseFloat(style.strokeWidth || "0") || 0;
  if (!stroke || strokeWidth <= 0) {
    return "";
  }
  const x1 = (numberAttr(element, "x1") + offset.x) * context.scale;
  const y1 = context.pageHeight - (numberAttr(element, "y1") + offset.y) * context.scale;
  const x2 = (numberAttr(element, "x2") + offset.x) * context.scale;
  const y2 = context.pageHeight - (numberAttr(element, "y2") + offset.y) * context.scale;
  return scoped([
    paintCommands(null, stroke, strokeWidth, style.strokeDasharray, context.scale),
    `${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`,
  ]);
}

function renderPath(d: string, style: CSSStyleDeclaration, context: PdfRenderContext, offset: PdfPoint): string {
  const path = pathDataToPdf(d, context, offset);
  if (!path) {
    return "";
  }
  const fill = parseCssColor(style.fill);
  const stroke = parseCssColor(style.stroke);
  const strokeWidth = parseFloat(style.strokeWidth || "0") || 0;
  return scoped([
    paintCommands(fill, stroke, strokeWidth, style.strokeDasharray, context.scale),
    path,
    paintOperator(fill, stroke, strokeWidth),
  ]);
}

function renderText(element: SVGTextElement, style: CSSStyleDeclaration, context: PdfRenderContext, offset: PdfPoint): string {
  const text = element.textContent ?? "";
  if (!text) {
    return "";
  }
  const fill = parseCssColor(style.fill) ?? { r: 0, g: 0, b: 0 };
  const fontSize = (parseFloat(style.fontSize || "12") || 12) * context.scale;
  const font = Number.parseInt(style.fontWeight || "400", 10) >= 600 ? "F2" : "F1";
  const textAnchor = element.getAttribute("text-anchor") || style.textAnchor;
  const approximateWidth = text.length * fontSize * 0.53;
  const x = (numberAttr(element, "x") + offset.x) * context.scale - (textAnchor === "middle" ? approximateWidth / 2 : textAnchor === "end" ? approximateWidth : 0);
  const y = context.pageHeight - (numberAttr(element, "y") + offset.y) * context.scale - fontSize * 0.34;
  return scoped([
    `${fmtColor(fill)} rg`,
    `BT /${font} ${fmt(fontSize)} Tf 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm ${pdfString(text)} Tj ET`,
  ]);
}

function buildPdf(content: string, pageWidth: number, pageHeight: number): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;

  const append = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | Uint8Array, extraBeforeBinary = "") => {
    offsets[id] = length;
    append(`${id} 0 obj\n`);
    if (body instanceof Uint8Array) {
      append(extraBeforeBinary);
      append(body);
      append("\nendstream\nendobj\n");
    } else {
      append(`${body}\nendobj\n`);
    }
  };

  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}] /Resources << /ProcSet [/PDF /Text] /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  );
  object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  object(6, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);

  const xrefOffset = length;
  append(`xref\n0 7\n0000000000 65535 f \n`);
  for (let id = 1; id <= 6; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

function pathDataToPdf(d: string, context: PdfRenderContext, offset: PdfPoint): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const commands: string[] = [];
  let index = 0;
  let command = "";
  let current = { x: 0, y: 0 };

  const hasNumber = () => index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index]);
  const read = () => Number(tokens[index++]);
  const point = (x: number, y: number, relative: boolean) => {
    const raw = relative ? { x: current.x + x, y: current.y + y } : { x, y };
    current = raw;
    return {
      x: (raw.x + offset.x) * context.scale,
      y: context.pageHeight - (raw.y + offset.y) * context.scale,
    };
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index++];
    }
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case "M": {
        let first = true;
        while (hasNumber()) {
          const p = point(read(), read(), relative);
          commands.push(`${fmt(p.x)} ${fmt(p.y)} ${first ? "m" : "l"}`);
          first = false;
        }
        break;
      }
      case "L":
        while (hasNumber()) {
          const p = point(read(), read(), relative);
          commands.push(`${fmt(p.x)} ${fmt(p.y)} l`);
        }
        break;
      case "H":
        while (hasNumber()) {
          const p = point(read(), relative ? 0 : current.y, relative);
          commands.push(`${fmt(p.x)} ${fmt(p.y)} l`);
        }
        break;
      case "V":
        while (hasNumber()) {
          const p = point(relative ? 0 : current.x, read(), relative);
          commands.push(`${fmt(p.x)} ${fmt(p.y)} l`);
        }
        break;
      case "C":
        while (hasNumber()) {
          const x1 = read();
          const y1 = read();
          const x2 = read();
          const y2 = read();
          const x = read();
          const y = read();
          const start = current;
          const c1 = toPdfPoint(relative ? start.x + x1 : x1, relative ? start.y + y1 : y1, context, offset);
          const c2 = toPdfPoint(relative ? start.x + x2 : x2, relative ? start.y + y2 : y2, context, offset);
          const end = point(x, y, relative);
          commands.push(`${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)} c`);
        }
        break;
      case "Q":
        while (hasNumber()) {
          const x1 = read();
          const y1 = read();
          const x = read();
          const y = read();
          const start = current;
          const control = relative ? { x: start.x + x1, y: start.y + y1 } : { x: x1, y: y1 };
          const endRaw = relative ? { x: start.x + x, y: start.y + y } : { x, y };
          const c1 = toPdfPoint(start.x + (2 / 3) * (control.x - start.x), start.y + (2 / 3) * (control.y - start.y), context, offset);
          const c2 = toPdfPoint(endRaw.x + (2 / 3) * (control.x - endRaw.x), endRaw.y + (2 / 3) * (control.y - endRaw.y), context, offset);
          const end = point(x, y, relative);
          commands.push(`${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)} c`);
        }
        break;
      case "Z":
        commands.push("h");
        break;
      default:
        index += 1;
    }
  }
  return commands.join("\n");
}

function toPdfPoint(x: number, y: number, context: PdfRenderContext, offset: PdfPoint): PdfPoint {
  return {
    x: (x + offset.x) * context.scale,
    y: context.pageHeight - (y + offset.y) * context.scale,
  };
}

function paintCommands(fill: PdfColor | null, stroke: PdfColor | null, strokeWidth: number, dashArray: string, scale: number): string {
  const commands = ["1 J", "1 j"];
  if (fill) {
    commands.push(`${fmtColor(fill)} rg`);
  }
  if (stroke && strokeWidth > 0) {
    commands.push(`${fmtColor(stroke)} RG`);
    commands.push(`${fmt(strokeWidth * scale)} w`);
  }
  const dashes = parseDashArray(dashArray, scale);
  commands.push(dashes.length > 0 ? `[${dashes.map(fmt).join(" ")}] 0 d` : "[] 0 d");
  return commands.join("\n");
}

function paintOperator(fill: PdfColor | null, stroke: PdfColor | null, strokeWidth: number): string {
  if (fill && stroke && strokeWidth > 0) {
    return "B";
  }
  if (fill) {
    return "f";
  }
  if (stroke && strokeWidth > 0) {
    return "S";
  }
  return "n";
}

function parseDashArray(value: string, scale: number): number[] {
  if (!value || value === "none") {
    return [];
  }
  return value
    .split(/[\s,]+/)
    .map((entry) => parseFloat(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => entry * scale);
}

function parseCssColor(value: string): PdfColor | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent") {
    return null;
  }
  if (normalized.startsWith("#")) {
    const hex = normalized.length === 4
      ? normalized.slice(1).split("").map((part) => `${part}${part}`).join("")
      : normalized.slice(1, 7);
    const numeric = Number.parseInt(hex, 16);
    return {
      r: ((numeric >> 16) & 255) / 255,
      g: ((numeric >> 8) & 255) / 255,
      b: (numeric & 255) / 255,
    };
  }
  const match = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (!match) {
    return null;
  }
  const [r, g, b, alpha = 1] = match[1]
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))
    .map((part, index) => (index < 3 ? part / 255 : part));
  const a = Math.max(0, Math.min(1, alpha));
  return {
    r: r * a + (1 - a),
    g: g * a + (1 - a),
    b: b * a + (1 - a),
  };
}

function addTranslate(offset: PdfPoint, transform: string | null): PdfPoint {
  const match = transform?.match(/translate\(\s*([-+]?\d*\.?\d+)(?:[\s,]+([-+]?\d*\.?\d+))?\s*\)/);
  if (!match) {
    return offset;
  }
  return {
    x: offset.x + Number(match[1]),
    y: offset.y + Number(match[2] ?? 0),
  };
}

function numberAttr(element: Element, name: string): number {
  return Number(element.getAttribute(name) ?? 0);
}

function scoped(commands: Array<string | null | undefined>): string {
  return ["q", ...commands.filter(Boolean), "Q"].join("\n");
}

function fmtColor(color: PdfColor): string {
  return `${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)}`;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "0";
}

function pdfString(value: string): string {
  const escaped = value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  return `(${escaped})`;
}

export const __exportFigureTest = {
  buildPdf,
  parseCssColor,
  pathDataToPdf,
  safeCanvasScale,
};
