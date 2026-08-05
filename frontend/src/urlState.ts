import type { FitMode } from "./hooks/useGraphAutoFit";
import type { InputMode } from "./inputParsing";
import type { LayoutMode } from "./layout";

// Figures, the enrichment table, and the run metadata can all be saved from a link.
export const EXPORT_FORMATS = ["png", "svg", "pdf", "csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type UrlAppState = {
  inputMode?: InputMode;
  query?: string;
  organism?: string;
  namespace?: string;
  ancestors?: number;
  descendants?: number;
  randomChildLimit?: boolean;
  childLimit?: number;
  includeObsolete?: boolean;
  selectedRelations?: string[];
  layoutMode?: LayoutMode;
  trimConnections?: boolean;
  showLegend?: boolean;
  fitMode?: FitMode;
  graphSearch?: string;
  // Enrichment request, so a link can reproduce an ORA run and not just a graph.
  enrichmentQuery?: string;
  enrichmentBackground?: string;
  enrichmentPropagate?: boolean;
  enrichmentCuratedOnly?: boolean;
  enrichmentReduceRedundancy?: boolean;
  enrichmentMinTermSize?: number;
  enrichmentMaxTermSize?: number;
  // Actions a link can ask the app to perform once it has loaded.
  autoRunEnrichment?: boolean;
  autoMapTopHits?: number;
  autoExport?: ExportFormat[];
};

export function readUrlState(): UrlAppState {
  if (typeof window === "undefined") {
    return {};
  }
  const params = new URLSearchParams(window.location.search);
  const state: UrlAppState = {};

  const mode = params.get("mode");
  if (mode === "go" || mode === "gene") {
    state.inputMode = mode;
  }

  const layout = params.get("layout");
  if (layout === "classic" || layout === "readable") {
    state.layoutMode = layout;
  }

  const fit = params.get("fit");
  if (fit === "height" || fit === "width") {
    state.fitMode = fit;
  }

  state.query = readString(params, "q");
  state.organism = readString(params, "org");
  state.namespace = readString(params, "ns");
  state.graphSearch = readString(params, "find");
  state.ancestors = readNumber(params, "anc");
  state.descendants = readNumber(params, "desc");
  state.childLimit = readNumber(params, "child");
  state.randomChildLimit = readBoolean(params, "random");
  state.includeObsolete = readBoolean(params, "obsolete");
  state.trimConnections = readBoolean(params, "trim");
  state.showLegend = readBoolean(params, "legend");
  state.enrichmentQuery = readString(params, "genes");
  state.enrichmentBackground = readString(params, "bg");
  state.enrichmentPropagate = readBoolean(params, "propagate");
  state.enrichmentCuratedOnly = readBoolean(params, "curated");
  state.enrichmentReduceRedundancy = readBoolean(params, "reduce");
  state.enrichmentMinTermSize = readNumber(params, "minsize");
  state.enrichmentMaxTermSize = readNumber(params, "maxsize");
  state.autoRunEnrichment = readBoolean(params, "run");
  state.autoMapTopHits = readNumber(params, "top");

  const requestedExports = (readString(params, "export") ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is ExportFormat => (EXPORT_FORMATS as readonly string[]).includes(entry));
  if (requestedExports.length > 0) {
    state.autoExport = [...new Set(requestedExports)];
  }

  const relations = readString(params, "rel");
  if (relations) {
    state.selectedRelations = relations.split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  return stripUndefined(state);
}

export function writeUrlState(state: UrlAppState): void {
  if (typeof window === "undefined") {
    return;
  }
  const params = stateToSearchParams(state);

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", nextUrl);
  }
}

export function serializeUrlState(state: UrlAppState): string {
  return stateToSearchParams(state).toString();
}

function stateToSearchParams(state: UrlAppState): URLSearchParams {
  const params = new URLSearchParams();
  setString(params, "mode", state.inputMode);
  setString(params, "q", state.query);
  setString(params, "org", state.organism);
  setString(params, "ns", state.namespace);
  setNumber(params, "anc", state.ancestors);
  setNumber(params, "desc", state.descendants);
  setBoolean(params, "random", state.randomChildLimit);
  setNumber(params, "child", state.childLimit);
  setBoolean(params, "obsolete", state.includeObsolete);
  setString(params, "rel", state.selectedRelations?.join(","));
  setString(params, "layout", state.layoutMode);
  setBoolean(params, "trim", state.trimConnections);
  setBoolean(params, "legend", state.showLegend);
  setString(params, "fit", state.fitMode);
  setString(params, "find", state.graphSearch);
  setString(params, "genes", state.enrichmentQuery);
  setString(params, "bg", state.enrichmentBackground);
  if (state.enrichmentQuery) {
    setBoolean(params, "propagate", state.enrichmentPropagate);
    setBoolean(params, "curated", state.enrichmentCuratedOnly);
    setBoolean(params, "reduce", state.enrichmentReduceRedundancy);
    setNumber(params, "minsize", state.enrichmentMinTermSize);
    setNumber(params, "maxsize", state.enrichmentMaxTermSize);
  }
  // Actions are only ever written when a caller asks for them, such as a saved example link.
  if (state.autoRunEnrichment) {
    params.set("run", "1");
  }
  setNumber(params, "top", state.autoMapTopHits);
  setString(params, "export", state.autoExport?.join(","));
  return params;
}

function readString(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value === "" ? undefined : value;
}

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBoolean(params: URLSearchParams, key: string): boolean | undefined {
  const value = params.get(key);
  if (value === null) {
    return undefined;
  }
  return value === "1" || value === "true";
}

function setString(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) {
    params.set(key, value);
  }
}

function setNumber(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) {
    params.set(key, String(value));
  }
}

function setBoolean(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value !== undefined) {
    params.set(key, value ? "1" : "0");
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
