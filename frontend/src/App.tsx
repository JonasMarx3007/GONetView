import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFocusedGraph, fetchOrganisms, fetchStats } from "./api";
import { GraphPane } from "./components/GraphPane";
import { Sidebar } from "./components/Sidebar";
import { exportFigure, exportMetadataJson } from "./exportFigure";
import { useGraphAutoFit, type FitMode } from "./hooks/useGraphAutoFit";
import { useGraphLayout } from "./hooks/useGraphLayout";
import { useSuggestions } from "./hooks/useSuggestions";
import { useTermGenes } from "./hooks/useTermGenes";
import { isAutoRefreshInputReady, parseGenes, parseTerms, replaceActiveSearchToken, type InputMode } from "./inputParsing";
import type { LayoutMode, PositionedNode } from "./layout";
import { DEFAULT_RELATIONS } from "./theme";
import type { GeneRecord, GOTerm, GraphResponse, Organism, StatsResponse } from "./types";
import { readUrlState, writeUrlState } from "./urlState";

const DEFAULT_TERM = "GO:0019319";
const CONTROL_AUTO_REFRESH_DELAY_MS = 260;
const INPUT_AUTO_REFRESH_DELAY_MS = 720;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 2.25;
const SEARCH_FOCUS_MIN_ZOOM = 1.05;
const SVG_CANVAS_MARGIN = 18;
const initialUrlState = readUrlState();
const initialInputMode = initialUrlState.inputMode ?? "go";
const initialQuery = initialUrlState.query ?? DEFAULT_TERM;
const initialSelectedTerms = initialInputMode === "go" ? parseTerms(initialQuery) : [DEFAULT_TERM];

type LoadFocusedOptions = {
  preserveCurrentGraph?: boolean;
  showFetching?: boolean;
  silentErrors?: boolean;
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

  const autoRefreshTimer = useRef<number | undefined>(undefined);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const graphRequestRef = useRef(0);
  const autoRefreshReadyRef = useRef(false);
  const autoRefreshValueKeyRef = useRef("");
  const lastGraphSignatureRef = useRef("");

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
  const maxAncestorDepth = stats?.maxAncestorDepth ?? graph?.maxAncestorDepth ?? 1;
  const maxDescendantDepth = stats?.maxDescendantDepth ?? graph?.maxDescendantDepth ?? 1;
  const selectedRelationsKey = selectedRelations.join("|");
  const graphSearchMatches = useMemo(() => {
    const normalized = graphSearch.trim().toLowerCase();
    if (!normalized || !laidOut) {
      return [];
    }
    return [...laidOut.nodes]
      .filter((node) => `${node.id} ${node.name} ${node.namespace}`.toLowerCase().includes(normalized))
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  }, [graphSearch, laidOut]);
  const graphSearchMatchIds = useMemo(() => new Set(graphSearchMatches.map((node) => node.id)), [graphSearchMatches]);
  const activeSearchMatch = activeSearchIndex >= 0 ? graphSearchMatches[activeSearchIndex] : undefined;

  useEffect(() => {
    setActiveSearchIndex(graphSearchMatches.length > 0 ? 0 : -1);
  }, [graphSearch, graphSearchMatches.length]);

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
        canvas.scrollTo({ left, top, behavior: "smooth" });
      });
    });
  }

  function navigateGraphSearch(direction: 1 | -1) {
    setActiveSearchIndex((current) => {
      if (graphSearchMatches.length === 0) {
        return -1;
      }
      const base = current >= 0 ? current : 0;
      return (base + direction + graphSearchMatches.length) % graphSearchMatches.length;
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
      inputChanged ? INPUT_AUTO_REFRESH_DELAY_MS : CONTROL_AUTO_REFRESH_DELAY_MS,
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
  ]);

  function graphSignature(values: string[]): string {
    return JSON.stringify({
      mode: inputMode,
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
    const { preserveCurrentGraph = false, showFetching = true, silentErrors = false } = options;
    const values = inputMode === "go" ? parseTerms(input) : parseGenes(input);
    if (values.length === 0) {
      if (!silentErrors) {
        setError(inputMode === "go" ? "Enter at least one GO ID" : "Enter at least one gene symbol or ID");
      }
      return;
    }

    window.clearTimeout(autoRefreshTimer.current);
    setAutoRefreshPending(false);
    const requestId = graphRequestRef.current + 1;
    graphRequestRef.current = requestId;
    const requestedMode = inputMode;
    const requestSignature = graphSignature(values);

    if (showFetching) {
      setLoading(true);
      setLoadingStage(inputMode === "gene" ? `Loading ${organismLabel(organisms, organism)} annotations` : "Building GO network");
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
      inputMode,
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
        lastGraphSignatureRef.current = nextValues.length > 0 ? graphSignature(nextValues) : requestSignature;
        autoRefreshReadyRef.current = true;
        setQuery(nextQuery);
        if (payload.missingTerms && payload.missingTerms.length > 0) {
          setError(`Ignored missing GO terms: ${payload.missingTerms.join(", ")}`);
        }
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
      query,
      inputMode,
      organism,
      namespace: namespace || "all",
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
            annotationDate: graph.annotationDate ?? null,
            organism: graph.organism ?? null,
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
      />

      <GraphPane
        sidebarExpanded={sidebarExpanded}
        graph={graph}
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
      />
    </div>
  );
}

function organismLabel(organisms: Organism[], key: string): string {
  return organisms.find((entry) => entry.key === key)?.label ?? key;
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
