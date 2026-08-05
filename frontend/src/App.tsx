import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MAX_TERM_SIZE,
  DEFAULT_MIN_TERM_SIZE,
  fetchEnrichment,
  fetchFocusedGraph,
  fetchOrganisms,
  fetchStats,
} from "./api";
import { APP_NAME, APP_REPOSITORY_URL, APP_VERSION } from "./appInfo";
import { EnrichmentPanel } from "./components/EnrichmentPanel";
import { GraphPane } from "./components/GraphPane";
import { Sidebar } from "./components/Sidebar";
import { exportEnrichmentCsv, exportFigure, exportMetadataJson } from "./exportFigure";
import { enrichmentCsv } from "./enrichment";
import { findGraphSearchMatches, nextGraphSearchIndex } from "./graphSearch";
import { useGraphAutoFit, type FitMode } from "./hooks/useGraphAutoFit";
import { useGraphLayout } from "./hooks/useGraphLayout";
import { useSuggestions } from "./hooks/useSuggestions";
import { useTermGenes } from "./hooks/useTermGenes";
import { isAutoRefreshInputReady, parseGenes, parseTerms, replaceActiveSearchToken, type InputMode } from "./inputParsing";
import type { LayoutMode, PositionedNode } from "./layout";
import { DEFAULT_RELATIONS } from "./theme";
import type { EnrichmentResponse, GeneRecord, GOTerm, GraphResponse, Organism, StatsResponse } from "./types";
import { readUrlState, writeUrlState, type ExportFormat } from "./urlState";

const DEFAULT_TERM = "GO:0019319";
const CONTROL_AUTO_REFRESH_DELAY_MS = 260;
const RELATION_AUTO_REFRESH_DELAY_MS = 1200;
const INPUT_AUTO_REFRESH_DELAY_MS = 720;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 2.25;
const SEARCH_FOCUS_MIN_ZOOM = 1.05;
const SVG_CANVAS_MARGIN = 18;
const DEFAULT_ENRICHMENT_PANEL_HEIGHT = 420;
const MIN_ENRICHMENT_PANEL_HEIGHT = 180;
const initialUrlState = readUrlState();
const initialInputMode = initialUrlState.inputMode ?? "go";
const initialQuery = initialUrlState.query ?? DEFAULT_TERM;
const initialSelectedTerms = initialInputMode === "go" ? parseTerms(initialQuery) : [DEFAULT_TERM];

type LoadFocusedOptions = {
  preserveCurrentGraph?: boolean;
  showFetching?: boolean;
  silentErrors?: boolean;
  mode?: InputMode;
  stage?: string;
  keepSourceNote?: boolean;
};

export function App() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [organisms, setOrganisms] = useState<Organism[]>([]);
  const [graph, setGraph] = useState<GraphResponse | null>(null);

  const [inputMode, setInputMode] = useState<InputMode>(initialInputMode);
  const [query, setQuery] = useState(initialQuery);
  const [selectedTerms, setSelectedTerms] = useState<string[]>(initialSelectedTerms.length > 0 ? initialSelectedTerms : [DEFAULT_TERM]);
  const [detailId, setDetailId] = useState(initialSelectedTerms[0] ?? DEFAULT_TERM);
  const [organism, setOrganism] = useState(initialUrlState.organism ?? "goa_human");
  const [namespace, setNamespace] = useState(initialUrlState.namespace ?? "");
  const [ancestors, setAncestors] = useState(initialUrlState.ancestors ?? 1);
  const [descendants, setDescendants] = useState(initialUrlState.descendants ?? 0);
  const [randomChildLimit, setRandomChildLimit] = useState(initialUrlState.randomChildLimit ?? false);
  const [childLimit, setChildLimit] = useState(initialUrlState.childLimit ?? 20);
  const [includeObsolete, setIncludeObsolete] = useState(initialUrlState.includeObsolete ?? false);
  const [selectedRelations, setSelectedRelations] = useState<string[]>(
    initialUrlState.selectedRelations && initialUrlState.selectedRelations.length > 0 ? initialUrlState.selectedRelations : DEFAULT_RELATIONS,
  );
  const [showLegend, setShowLegend] = useState(initialUrlState.showLegend ?? true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialUrlState.layoutMode ?? "readable");
  const [fitMode, setFitMode] = useState<FitMode>(initialUrlState.fitMode ?? "height");
  const [trimConnections, setTrimConnections] = useState(initialUrlState.trimConnections ?? false);
  const [graphSearch, setGraphSearch] = useState(initialUrlState.graphSearch ?? "");
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [scale, setScale] = useState(0.82);

  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("Loading ontology");
  const [error, setError] = useState("");
  const [showDescendantGenes, setShowDescendantGenes] = useState(false);
  const [autoRefreshPending, setAutoRefreshPending] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [enrichmentQuery, setEnrichmentQuery] = useState(initialUrlState.enrichmentQuery ?? "");
  const [enrichmentBackground, setEnrichmentBackground] = useState(initialUrlState.enrichmentBackground ?? "");
  const [enrichmentPropagate, setEnrichmentPropagate] = useState(initialUrlState.enrichmentPropagate ?? true);
  const [enrichmentMinTermSize, setEnrichmentMinTermSize] = useState(initialUrlState.enrichmentMinTermSize ?? DEFAULT_MIN_TERM_SIZE);
  const [enrichmentCuratedOnly, setEnrichmentCuratedOnly] = useState(initialUrlState.enrichmentCuratedOnly ?? false);
  const [enrichmentReduceRedundancy, setEnrichmentReduceRedundancy] = useState(initialUrlState.enrichmentReduceRedundancy ?? false);
  const [enrichmentMaxTermSize, setEnrichmentMaxTermSize] = useState(initialUrlState.enrichmentMaxTermSize ?? DEFAULT_MAX_TERM_SIZE);
  const [enrichment, setEnrichment] = useState<EnrichmentResponse | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState("");
  const [enrichmentRunSignature, setEnrichmentRunSignature] = useState("");
  // Explains where the current graph came from when it was not built from the query box.
  const [graphSourceNote, setGraphSourceNote] = useState("");
  const [enrichmentCollapsed, setEnrichmentCollapsed] = useState(false);
  const [enrichmentPanelHeight, setEnrichmentPanelHeight] = useState(DEFAULT_ENRICHMENT_PANEL_HEIGHT);

  const autoRefreshTimer = useRef<number | undefined>(undefined);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const graphRequestRef = useRef(0);
  const enrichmentRequestRef = useRef(0);
  const autoRefreshReadyRef = useRef(false);
  const autoRefreshValueKeyRef = useRef("");
  const autoRefreshRelationsKeyRef = useRef("");
  const lastGraphSignatureRef = useRef("");
  const pendingAutoRunRef = useRef(initialUrlState.autoRunEnrichment ?? false);
  const pendingAutoMapRef = useRef(initialUrlState.autoMapTopHits ?? 0);
  const pendingAutoExportRef = useRef<ExportFormat[]>(initialUrlState.autoExport ?? []);

  const { termSuggestions, geneSuggestions, clearSuggestions } = useSuggestions({ query, inputMode, organism, includeObsolete });
  const { detailGenes, detailGeneCount } = useTermGenes(detailId, organism, showDescendantGenes);
  const {
    connectionGraph,
    laidOut,
    buildingConnections,
    layouting,
    layoutNotice,
    setLayoutNotice,
    clearGraphLayout,
    invalidateLayoutRequests,
  } = useGraphLayout({ graph, selectedTerms, trimConnections, layoutMode });
  const svgExtraWidth = showLegend ? 410 : 0;
  const fitGraphToCanvas = useGraphAutoFit(laidOut, canvasRef, setScale, {
    fitMode,
    contentWidth: (laidOut?.width ?? 0) + svgExtraWidth,
  });

  const selectedTerm = graph?.nodes.find((node) => node.id === detailId);
  const maxAncestorDepth = stats?.maxAncestorDepth ?? graph?.maxAncestorDepth ?? Math.max(ancestors, 1);
  const maxDescendantDepth = stats?.maxDescendantDepth ?? graph?.maxDescendantDepth ?? Math.max(descendants, 1);
  const selectedRelationsKey = selectedRelations.join("|");
  const graphSearchMatches = useMemo(() => {
    return findGraphSearchMatches(laidOut?.nodes, graphSearch);
  }, [graphSearch, laidOut]);
  const graphSearchMatchIds = useMemo(() => new Set(graphSearchMatches.map((node) => node.id)), [graphSearchMatches]);
  const activeSearchMatch = activeSearchIndex >= 0 ? graphSearchMatches[activeSearchIndex] : undefined;
  const currentEnrichmentSignature = useMemo(() => {
    return enrichmentSignature(parseGenes(enrichmentQuery), parseGenes(enrichmentBackground));
  }, [
    enrichmentQuery,
    enrichmentBackground,
    organism,
    namespace,
    includeObsolete,
    enrichmentPropagate,
    enrichmentMinTermSize,
    enrichmentMaxTermSize,
    enrichmentCuratedOnly,
    enrichmentReduceRedundancy,
  ]);
  const enrichmentStale = Boolean(enrichment) && currentEnrichmentSignature !== enrichmentRunSignature;

  useEffect(() => {
    setActiveSearchIndex(graphSearchMatches.length > 0 ? 0 : -1);
  }, [graphSearch, graphSearchMatches.length]);

  // A link can ask for a full run: enrichment, then a graph of its strongest hits, then a file.
  useEffect(() => {
    if (!pendingAutoRunRef.current || !enrichmentQuery.trim()) {
      return;
    }
    pendingAutoRunRef.current = false;
    runEnrichment();
  }, []);

  useEffect(() => {
    const topHits = pendingAutoMapRef.current;
    if (!enrichment || !topHits || topHits <= 0) {
      return;
    }
    pendingAutoMapRef.current = 0;
    const top = [...enrichment.results]
      .sort((a, b) => a.adjustedPValue - b.adjustedPValue || a.pValue - b.pValue)
      .slice(0, topHits);
    if (top.length > 0) {
      mapEnrichmentTerms(top.map((result) => result.term.id), `top ${top.length} enriched terms by FDR`);
    }
  }, [enrichment]);

  useEffect(() => {
    const formats = pendingAutoExportRef.current;
    if (formats.length === 0 || loading || layouting || buildingConnections || enrichmentLoading) {
      return;
    }
    const wantsFigure = formats.some((format) => format === "png" || format === "svg" || format === "pdf");
    if (wantsFigure && !laidOut) {
      return;
    }
    if (formats.includes("csv") && !enrichment) {
      // The enrichment may still be on its way in; only complain once it cannot arrive.
      if (pendingAutoRunRef.current) {
        return;
      }
      setEnrichmentError("Exporting the enrichment table needs a gene list and run=1 in the link.");
      pendingAutoExportRef.current = formats.filter((format) => format !== "csv");
      return;
    }

    // One frame after the final layout so the SVG on screen is what gets written out.
    const timer = window.setTimeout(() => {
      pendingAutoExportRef.current = [];
      for (const format of formats) {
        if (format === "csv") {
          if (enrichment) {
            exportEnrichmentCsv(enrichmentCsv(enrichment.results), enrichment.organism.key);
          }
        } else if (format === "json") {
          exportMetadata();
        } else {
          exportFigure(svgRef.current, format);
        }
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [laidOut, loading, layouting, buildingConnections, enrichmentLoading, enrichment]);

  useEffect(() => {
    if (!activeSearchMatch || loading || buildingConnections || layouting) {
      return;
    }
    focusGraphNode(activeSearchMatch);
  }, [activeSearchMatch?.id, loading, buildingConnections, layouting]);

  function focusGraphNode(node: PositionedNode) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const nextScale = Math.min(MAX_ZOOM, Math.max(scale, SEARCH_FOCUS_MIN_ZOOM));
    if (nextScale !== scale) {
      setScale(nextScale);
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const left = Math.max(0, (node.x + node.width / 2) * nextScale + SVG_CANVAS_MARGIN - canvas.clientWidth / 2);
        const top = Math.max(0, (node.y + node.height / 2) * nextScale + SVG_CANVAS_MARGIN - canvas.clientHeight / 2);
        canvas.scrollTo({ left, top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
    });
  }

  function navigateGraphSearch(direction: 1 | -1) {
    setActiveSearchIndex((current) => {
      return nextGraphSearchIndex(current, graphSearchMatches.length, direction);
    });
  }

  useEffect(() => {
    fetchStats().then(setStats).catch((err: Error) => setError(err.message));
    fetchOrganisms()
      .then((payload) => {
        setOrganisms(payload);
        if (payload.length > 0 && !payload.some((entry) => entry.key === organism)) {
          setOrganism(payload[0].key);
        }
      })
      .catch((err: Error) => setError(err.message));
    loadFocused(initialQuery);
  }, []);

  useEffect(() => {
    setAncestors((value) => Math.min(value, maxAncestorDepth));
    setDescendants((value) => Math.min(value, maxDescendantDepth));
  }, [maxAncestorDepth, maxDescendantDepth]);

  useEffect(() => {
    if (!autoRefreshReadyRef.current) {
      return;
    }

    const values = inputMode === "go" ? parseTerms(query) : parseGenes(query);
    if (values.length === 0) {
      setAutoRefreshPending(false);
      return;
    }

    const valueKey = `${inputMode}:${values.join("\u0001")}`;
    const inputChanged = autoRefreshValueKeyRef.current !== valueKey;
    autoRefreshValueKeyRef.current = valueKey;
    const relationsChanged = Boolean(autoRefreshRelationsKeyRef.current && autoRefreshRelationsKeyRef.current !== selectedRelationsKey);
    autoRefreshRelationsKeyRef.current = selectedRelationsKey;
    if (inputChanged && !isAutoRefreshInputReady(inputMode, query)) {
      setAutoRefreshPending(false);
      return;
    }

    const signature = graphSignature(values);
    if (signature === lastGraphSignatureRef.current) {
      setAutoRefreshPending(false);
      return;
    }

    window.clearTimeout(autoRefreshTimer.current);
    setAutoRefreshPending(true);
    autoRefreshTimer.current = window.setTimeout(
      () => {
        setAutoRefreshPending(false);
        loadFocused(query, {
          preserveCurrentGraph: inputChanged,
          showFetching: !inputChanged,
          silentErrors: inputChanged,
        });
      },
      inputChanged ? INPUT_AUTO_REFRESH_DELAY_MS : relationsChanged ? RELATION_AUTO_REFRESH_DELAY_MS : CONTROL_AUTO_REFRESH_DELAY_MS,
    );
    return () => {
      window.clearTimeout(autoRefreshTimer.current);
      setAutoRefreshPending(false);
    };
  }, [query, inputMode, organism, namespace, ancestors, descendants, randomChildLimit, childLimit, includeObsolete, selectedRelationsKey]);

  useEffect(() => {
    writeUrlState({
      inputMode,
      query,
      organism,
      namespace,
      ancestors,
      descendants,
      randomChildLimit,
      childLimit,
      includeObsolete,
      selectedRelations,
      layoutMode,
      trimConnections,
      showLegend,
      fitMode,
      graphSearch,
      enrichmentQuery,
      enrichmentBackground,
      enrichmentPropagate,
        enrichmentCuratedOnly,
      enrichmentReduceRedundancy,
      enrichmentMinTermSize,
      enrichmentMaxTermSize,
    });
  }, [
    inputMode,
    query,
    organism,
    namespace,
    ancestors,
    descendants,
    randomChildLimit,
    childLimit,
    includeObsolete,
    selectedRelationsKey,
    layoutMode,
    trimConnections,
    showLegend,
    fitMode,
    graphSearch,
    enrichmentQuery,
    enrichmentBackground,
    enrichmentPropagate,
    enrichmentCuratedOnly,
    enrichmentReduceRedundancy,
    enrichmentMinTermSize,
    enrichmentMaxTermSize,
  ]);

  function graphSignature(values: string[], mode: InputMode = inputMode): string {
    return JSON.stringify({
      mode,
      values,
      organism,
      namespace,
      ancestors,
      descendants,
      randomChildLimit,
      childLimit: randomChildLimit ? childLimit : null,
      includeObsolete,
      selectedRelations,
    });
  }

  function loadFocused(input = query, options: LoadFocusedOptions = {}) {
    const { preserveCurrentGraph = false, showFetching = true, silentErrors = false, mode = inputMode, stage } = options;
    const values = mode === "go" ? parseTerms(input) : parseGenes(input);
    if (values.length === 0) {
      if (!silentErrors) {
        setError(mode === "go" ? "Enter at least one GO ID" : "Enter at least one gene symbol or ID");
      }
      return;
    }

    window.clearTimeout(autoRefreshTimer.current);
    setAutoRefreshPending(false);
    if (!options.keepSourceNote) {
      setGraphSourceNote("");
    }
    const requestId = graphRequestRef.current + 1;
    graphRequestRef.current = requestId;
    const requestedMode = mode;
    const requestSignature = graphSignature(values, mode);

    if (showFetching) {
      setLoading(true);
      setLoadingStage(stage ?? (mode === "gene" ? `Loading ${organismLabel(organisms, organism)} annotations` : "Building GO network"));
    }
    if (!silentErrors) {
      setError("");
    }
    setLayoutNotice("");

    if (preserveCurrentGraph) {
      invalidateLayoutRequests();
    } else {
      clearGraphLayout();
    }

    fetchFocusedGraph(
      mode,
      values,
      organism,
      ancestors,
      descendants,
      namespace,
      randomChildLimit,
      childLimit,
      includeObsolete,
      selectedRelations,
    )
      .then((payload) => {
        if (requestId !== graphRequestRef.current) {
          return;
        }
        if (showFetching) {
          setLoadingStage("Building visible paths");
        }
        setGraph(payload);
        setSelectedTerms(payload.selectedTerms.length > 0 ? payload.selectedTerms : values);
        setDetailId(payload.selectedTerms[0] ?? values[0]);
        const nextQuery = requestedMode === "gene" && payload.selectedGenes ? payload.selectedGenes.map((gene) => gene.symbol).join("\n") : values.join("\n");
        const nextValues = requestedMode === "gene" ? parseGenes(nextQuery) : parseTerms(nextQuery);
        lastGraphSignatureRef.current = nextValues.length > 0 ? graphSignature(nextValues, requestedMode) : requestSignature;
        autoRefreshReadyRef.current = true;
        setQuery(nextQuery);
        setError(graphWarnings(payload, organismLabel(organisms, organism), includeObsolete));
      })
      .catch((err: Error) => {
        if (requestId === graphRequestRef.current && !silentErrors) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (requestId === graphRequestRef.current) {
          setLoading(false);
          setLoadingStage("Ready");
        }
      });
  }

  function toggleRelation(relation: string) {
    setSelectedRelations((current) => {
      if (current.includes(relation)) {
        const next = current.filter((entry) => entry !== relation);
        return next.length > 0 ? next : DEFAULT_RELATIONS;
      }
      return [...current, relation];
    });
  }

  function switchInputMode(nextMode: InputMode) {
    if (nextMode === inputMode) {
      return;
    }
    window.clearTimeout(autoRefreshTimer.current);
    setAutoRefreshPending(false);
    graphRequestRef.current += 1;
    invalidateLayoutRequests();
    setInputMode(nextMode);
    setQuery("");
    clearSuggestions();
    setError("");
    setLayoutNotice("");
  }

  function enrichmentSignature(genes: string[], background: string[]): string {
    return JSON.stringify({
      genes,
      background,
      organism,
      namespace,
      includeObsolete,
      propagate: enrichmentPropagate,
      minTermSize: enrichmentMinTermSize,
      maxTermSize: enrichmentMaxTermSize,
      curatedOnly: enrichmentCuratedOnly,
      reduceRedundancy: enrichmentReduceRedundancy,
    });
  }

  function useGraphGenesForEnrichment() {
    setEnrichmentQuery(parseGenes(query).join("\n"));
    setEnrichmentError("");
  }

  function runEnrichment() {
    const genes = parseGenes(enrichmentQuery);
    if (genes.length === 0) {
      setEnrichmentError("Enter at least one gene symbol or ID to test.");
      return;
    }
    const background = parseGenes(enrichmentBackground);
    const signature = enrichmentSignature(genes, background);
    const requestId = enrichmentRequestRef.current + 1;
    enrichmentRequestRef.current = requestId;
    setEnrichmentLoading(true);
    setEnrichmentError("");
    fetchEnrichment(
      genes,
      background,
      organism,
      namespace,
      includeObsolete,
      enrichmentPropagate,
      enrichmentMinTermSize,
      enrichmentMaxTermSize,
      enrichmentCuratedOnly,
      enrichmentReduceRedundancy,
    )
      .then((response) => {
        if (requestId === enrichmentRequestRef.current) {
          setEnrichment(response);
          setEnrichmentRunSignature(signature);
        }
      })
      .catch((err: Error) => {
        if (requestId === enrichmentRequestRef.current) {
          setEnrichmentError(err.message);
        }
      })
      .finally(() => {
        if (requestId === enrichmentRequestRef.current) {
          setEnrichmentLoading(false);
        }
      });
  }

  function resizeEnrichmentPanel(nextHeight: number) {
    const ceiling = Math.max(MIN_ENRICHMENT_PANEL_HEIGHT, window.innerHeight - 220);
    setEnrichmentPanelHeight(Math.min(ceiling, Math.max(MIN_ENRICHMENT_PANEL_HEIGHT, nextHeight)));
  }

  function mapEnrichmentTerms(termIds: string[], description: string) {
    if (termIds.length === 0) {
      return;
    }
    setGraphSourceNote(description);
    const nextQuery = termIds.join("\n");
    clearSuggestions();
    setInputMode("go");
    setQuery(nextQuery);
    autoRefreshValueKeyRef.current = `go:${termIds.join("\u0001")}`;
    lastGraphSignatureRef.current = graphSignature(termIds, "go");
    loadFocused(nextQuery, { mode: "go", stage: "Building enriched GO network", keepSourceNote: true });
  }

  function chooseTerm(term: GOTerm) {
    clearSuggestions();
    const nextQuery = replaceActiveSearchToken(query, term.id);
    setQuery(nextQuery);
    loadFocused(nextQuery, { preserveCurrentGraph: true });
  }

  function chooseGene(gene: GeneRecord) {
    clearSuggestions();
    const nextQuery = replaceActiveSearchToken(query, gene.symbol);
    setQuery(nextQuery);
    loadFocused(nextQuery, { preserveCurrentGraph: true });
  }

  function exportMetadata() {
    exportMetadataJson({
      generatedAt: new Date().toISOString(),
      app: {
        name: APP_NAME,
        version: APP_VERSION,
        repository: APP_REPOSITORY_URL || null,
      },
      query,
      inputMode,
      organism,
      namespace: namespace || "all",
      data: {
        goVersion: stats?.dataVersion ?? null,
        goSource: stats?.source ?? null,
        generatedAt: stats?.generatedAt ?? null,
        organism: graph?.organism ?? null,
        annotationDate: graph?.annotationDate ?? null,
      },
      ancestorDepth: ancestors,
      descendantDepth: descendants,
      randomChildLimit,
      childLimit: randomChildLimit ? childLimit : null,
      includeObsolete,
      selectedRelations,
      layoutMode,
      fitMode,
      trimConnections,
      showLegend,
      selectedTerms,
      selectedGenes: graph?.selectedGenes ?? [],
      graph: graph
        ? {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            truncated: graph.truncated,
            missingTerms: graph.missingTerms ?? [],
            missingGenes: graph.missingGenes ?? [],
            genesWithoutTerms: graph.genesWithoutTerms ?? [],
            annotationDate: graph.annotationDate ?? null,
            organism: graph.organism ?? null,
          }
        : null,
      enrichment: enrichment
        ? {
            backgroundMode: enrichment.backgroundMode,
            backgroundSize: enrichment.backgroundSize,
            backgroundSources: enrichment.backgroundSources,
            backgroundKind: enrichment.backgroundKind,
            excludedEntities: enrichment.excludedEntities,
            propagated: enrichment.propagated,
            testedTerms: enrichment.testedTerms,
            testedTermsByNamespace: enrichment.testedTermsByNamespace,
            minTermSize: enrichment.minTermSize,
            maxTermSize: enrichment.maxTermSize,
            evidenceMode: enrichment.evidenceMode,
            excludedWithoutCuratedEvidence: enrichment.excludedWithoutCuratedEvidence,
            redundancyReduced: enrichment.redundancyReduced,
            redundantTermsRemoved: enrichment.redundantTermsRemoved,
            queryGenes: enrichment.queryGenes,
            missingGenes: enrichment.missingGenes,
            backgroundMissingGenes: enrichment.backgroundMissingGenes,
            outsideBackgroundGenes: enrichment.outsideBackgroundGenes,
            results: enrichment.results,
          }
        : null,
    });
  }

  function copySelectedTerms() {
    void copyLines(selectedTerms, "GO IDs");
  }

  function copySelectedGenes() {
    const selectedGenes = graph?.selectedGenes?.map((gene) => gene.symbol) ?? [];
    const genes = selectedGenes.length > 0 ? selectedGenes : detailGenes.map((gene) => gene.symbol);
    void copyLines(genes, "genes");
  }

  async function copyLines(lines: string[], label: string) {
    const text = lines.filter(Boolean).join("\n");
    if (!text) {
      setCopyStatus(`No ${label} to copy`);
      window.setTimeout(() => setCopyStatus(""), 1800);
      return;
    }
    try {
      await copyText(text);
      setCopyStatus(`Copied ${label}`);
    } catch {
      setCopyStatus(`Could not copy ${label}`);
    }
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  return (
    <div className={`app-shell ${sidebarExpanded ? "" : "sidebar-collapsed"}`.trim()}>
      <Sidebar
        expanded={sidebarExpanded}
        stats={stats}
        inputMode={inputMode}
        query={query}
        organisms={organisms}
        organism={organism}
        namespace={namespace}
        layoutMode={layoutMode}
        graphSearch={graphSearch}
        graphSearchMatchCount={graphSearchMatches.length}
        activeGraphSearchIndex={activeSearchIndex}
        scale={scale}
        fitMode={fitMode}
        ancestors={ancestors}
        descendants={descendants}
        maxAncestorDepth={maxAncestorDepth}
        maxDescendantDepth={maxDescendantDepth}
        randomChildLimit={randomChildLimit}
        childLimit={childLimit}
        includeObsolete={includeObsolete}
        selectedRelations={selectedRelations}
        trimConnections={trimConnections}
        showLegend={showLegend}
        selectedTerm={selectedTerm}
        detailGeneCount={detailGeneCount}
        detailGenes={detailGenes}
        showDescendantGenes={showDescendantGenes}
        termSuggestions={termSuggestions}
        geneSuggestions={geneSuggestions}
        autoRefreshPending={autoRefreshPending}
        copyStatus={copyStatus}
        enrichmentQuery={enrichmentQuery}
        enrichmentBackground={enrichmentBackground}
        enrichmentPropagate={enrichmentPropagate}
        enrichmentMinTermSize={enrichmentMinTermSize}
        enrichmentMaxTermSize={enrichmentMaxTermSize}
        enrichmentCuratedOnly={enrichmentCuratedOnly}
        enrichmentReduceRedundancy={enrichmentReduceRedundancy}
        enrichmentLoading={enrichmentLoading}
        enrichmentError={enrichmentError}
        enrichmentStale={enrichmentStale}
        onToggleExpanded={() => setSidebarExpanded((value) => !value)}
        onInputModeChange={switchInputMode}
        onQueryChange={setQuery}
        onMap={loadFocused}
        onOrganismChange={setOrganism}
        onNamespaceChange={setNamespace}
        onLayoutModeChange={setLayoutMode}
        onGraphSearchChange={setGraphSearch}
        onGraphSearchPrevious={() => navigateGraphSearch(-1)}
        onGraphSearchNext={() => navigateGraphSearch(1)}
        onGraphSearchClear={() => setGraphSearch("")}
        onFitModeChange={setFitMode}
        onAncestorsChange={setAncestors}
        onDescendantsChange={setDescendants}
        onRandomChildLimitChange={setRandomChildLimit}
        onChildLimitChange={setChildLimit}
        onIncludeObsoleteChange={setIncludeObsolete}
        onToggleRelation={toggleRelation}
        onTrimConnectionsChange={setTrimConnections}
        onZoomOut={() => setScale((value) => Math.max(MIN_ZOOM, value - 0.08))}
        onFitGraph={() => fitGraphToCanvas()}
        onZoomIn={() => setScale((value) => Math.min(MAX_ZOOM, value + 0.08))}
        onExport={(format) => exportFigure(svgRef.current, format)}
        onExportMetadata={exportMetadata}
        onCopySelectedTerms={copySelectedTerms}
        onCopySelectedGenes={copySelectedGenes}
        onShowLegendChange={setShowLegend}
        onShowDescendantGenesChange={setShowDescendantGenes}
        onChooseTerm={chooseTerm}
        onChooseGene={chooseGene}
        onEnrichmentQueryChange={setEnrichmentQuery}
        onEnrichmentBackgroundChange={setEnrichmentBackground}
        onEnrichmentPropagateChange={setEnrichmentPropagate}
        onEnrichmentMinTermSizeChange={setEnrichmentMinTermSize}
        onEnrichmentMaxTermSizeChange={setEnrichmentMaxTermSize}
        onEnrichmentCuratedOnlyChange={setEnrichmentCuratedOnly}
        onEnrichmentReduceRedundancyChange={setEnrichmentReduceRedundancy}
        onRunEnrichment={runEnrichment}
      />

      <GraphPane
        sidebarExpanded={sidebarExpanded}
        graph={graph}
        graphSourceNote={graphSourceNote}
        trimConnections={trimConnections}
        connectionGraph={connectionGraph}
        selectedTerms={selectedTerms}
        layoutNotice={layoutNotice}
        error={error}
        autoRefreshPending={autoRefreshPending}
        graphSearch={graphSearch}
        searchMatchIds={graphSearchMatchIds}
        activeSearchMatchId={activeSearchMatch?.id ?? ""}
        canvasRef={canvasRef}
        svgRef={svgRef}
        loading={loading}
        loadingStage={loadingStage}
        buildingConnections={buildingConnections}
        layouting={layouting}
        laidOut={laidOut}
        svgExtraWidth={svgExtraWidth}
        scale={scale}
        showLegend={showLegend}
        selectedRelations={selectedRelations}
        onExpandSidebar={() => setSidebarExpanded(true)}
        onSelectNode={setDetailId}
        onOpenNode={(id) => loadFocused(id)}
        enrichmentCollapsed={enrichmentCollapsed}
        enrichmentPanelHeight={enrichmentPanelHeight}
        enrichmentPanel={
          enrichment ? (
            <EnrichmentPanel
              enrichment={enrichment}
              collapsed={enrichmentCollapsed}
              onToggleCollapsed={() => setEnrichmentCollapsed((value) => !value)}
              onResize={resizeEnrichmentPanel}
              stale={enrichmentStale}
              rerunning={enrichmentLoading}
              onRerun={runEnrichment}
              onMapTerms={mapEnrichmentTerms}
              onClose={() => setEnrichment(null)}
            />
          ) : undefined
        }
      />
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function organismLabel(organisms: Organism[], key: string): string {
  return organisms.find((entry) => entry.key === key)?.label ?? key;
}

function graphWarnings(graph: GraphResponse, organism: string, includeObsolete: boolean): string {
  const warnings: string[] = [];
  if (graph.missingTerms && graph.missingTerms.length > 0) {
    const obsoleteHint = includeObsolete ? "" : " or enable obsolete terms";
    warnings.push(`Ignored GO terms not found in the current ontology: ${formatList(graph.missingTerms)}. Check GO IDs or names${obsoleteHint}.`);
  }
  if (graph.missingGenes && graph.missingGenes.length > 0) {
    warnings.push(`Ignored genes not found for ${organism}: ${formatList(graph.missingGenes)}. Check the organism or use a symbol, gene ID, or database ID.`);
  }
  if (graph.genesWithoutTerms && graph.genesWithoutTerms.length > 0) {
    warnings.push(
      `Matched genes without GO annotations in ${organism}: ${formatList(graph.genesWithoutTerms.map((gene) => gene.symbol))}.`,
    );
  }
  return warnings.join(" ");
}

function formatList(values: string[], maxItems = 5): string {
  const shown = values.slice(0, maxItems).join(", ");
  const remaining = values.length - maxItems;
  return remaining > 0 ? `${shown}, and ${remaining} more` : shown;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
