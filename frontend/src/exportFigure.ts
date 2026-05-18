import { NAMESPACE_STYLES, namespaceClass, relationClass, RELATION_STYLES } from "./theme";

export type ExportFormat = "png" | "svg" | "pdf";

export async function exportFigure(svg: SVGSVGElement | null, format: ExportFormat) {
  if (!svg) {
    return;
  }
  const fileBase = `GONetView-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (format === "svg") {
    downloadBlob(new Blob([serializeFigureSvg(svg)], { type: "image/svg+xml;charset=utf-8" }), `${fileBase}.svg`);
    return;
  }

  const canvas = await renderSvgToCanvas(svg, format === "pdf" ? 2 : 3);
  if (format === "png") {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${fileBase}.png`);
      }
    }, "image/png");
    return;
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
  const pdf = buildImagePdf(dataUrl, canvas.width, canvas.height);
  const pdfBuffer = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(pdfBuffer).set(pdf);
  downloadBlob(new Blob([pdfBuffer], { type: "application/pdf" }), `${fileBase}.pdf`);
}

export function exportMetadataJson(metadata: unknown) {
  const fileBase = `GONetView-metadata-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const json = JSON.stringify(metadata, null, 2);
  downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), `${fileBase}.json`);
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
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
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

function buildImagePdf(dataUrl: string, imageWidth: number, imageHeight: number): Uint8Array {
  const imageBytes = dataUrlToBytes(dataUrl);
  const pageWidth = Math.min(1440, Math.max(240, imageWidth));
  const pageHeight = Math.max(240, Math.round((pageWidth / imageWidth) * imageHeight));
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
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    imageBytes,
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
  );
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);

  const xrefOffset = length;
  append(`xref\n0 6\n0000000000 65535 f \n`);
  for (let id = 1; id <= 5; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
