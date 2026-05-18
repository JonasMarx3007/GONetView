import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Download,
  FileJson,
  GitBranch,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { APP_VERSION } from "../appInfo";
import { SAVED_EXAMPLES } from "../examples";
import type { FitMode } from "../hooks/useGraphAutoFit";
import type { InputMode } from "../inputParsing";
import type { LayoutMode } from "../layout";
import { RELATION_STYLES } from "../theme";
import type { GeneRecord, GOTerm, Organism, StatsResponse } from "../types";
import { TermDetail } from "./TermDetail";

type SidebarProps = {
  expanded: boolean;
  stats: StatsResponse | null;
  inputMode: InputMode;
  query: string;
  organisms: Organism[];
  organism: string;
  namespace: string;
  layoutMode: LayoutMode;
  graphSearch: string;
  graphSearchMatchCount: number;
  activeGraphSearchIndex: number;
  scale: number;
  fitMode: FitMode;
  ancestors: number;
  descendants: number;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  randomChildLimit: boolean;
  childLimit: number;
  includeObsolete: boolean;
  selectedRelations: string[];
  trimConnections: boolean;
  showLegend: boolean;
  selectedTerm: GOTerm | undefined;
  detailGeneCount: number;
  detailGenes: GeneRecord[];
  showDescendantGenes: boolean;
  termSuggestions: GOTerm[];
  geneSuggestions: GeneRecord[];
  autoRefreshPending: boolean;
  copyStatus: string;
  onToggleExpanded: () => void;
  onInputModeChange: (mode: InputMode) => void;
  onQueryChange: (value: string) => void;
  onMap: (input?: string) => void;
  onOrganismChange: (value: string) => void;
  onNamespaceChange: (value: string) => void;
  onLayoutModeChange: (value: LayoutMode) => void;
  onGraphSearchChange: (value: string) => void;
  onGraphSearchPrevious: () => void;
  onGraphSearchNext: () => void;
  onGraphSearchClear: () => void;
  onFitModeChange: (value: FitMode) => void;
  onAncestorsChange: (value: number) => void;
  onDescendantsChange: (value: number) => void;
  onRandomChildLimitChange: (value: boolean) => void;
  onChildLimitChange: (value: number) => void;
  onIncludeObsoleteChange: (value: boolean) => void;
  onToggleRelation: (relation: string) => void;
  onTrimConnectionsChange: (value: boolean) => void;
  onZoomOut: () => void;
  onFitGraph: () => void;
  onZoomIn: () => void;
  onExport: (format: "png" | "svg" | "pdf") => void;
  onExportMetadata: () => void;
  onCopySelectedTerms: () => void;
  onCopySelectedGenes: () => void;
  onShowLegendChange: (value: boolean) => void;
  onShowDescendantGenesChange: (value: boolean) => void;
  onChooseTerm: (term: GOTerm) => void;
  onChooseGene: (gene: GeneRecord) => void;
};

type SectionKey = "input" | "scope" | "layout" | "relations" | "details" | "export" | "references";

const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  input: true,
  scope: true,
  layout: true,
  relations: false,
  details: true,
  export: false,
  references: false,
};

export function Sidebar({
  expanded,
  stats,
  inputMode,
  query,
  organisms,
  organism,
  namespace,
  layoutMode,
  graphSearch,
  graphSearchMatchCount,
  activeGraphSearchIndex,
  scale,
  fitMode,
  ancestors,
  descendants,
  maxAncestorDepth,
  maxDescendantDepth,
  randomChildLimit,
  childLimit,
  includeObsolete,
  selectedRelations,
  trimConnections,
  showLegend,
  selectedTerm,
  detailGeneCount,
  detailGenes,
  showDescendantGenes,
  termSuggestions,
  geneSuggestions,
  autoRefreshPending,
  copyStatus,
  onToggleExpanded,
  onInputModeChange,
  onQueryChange,
  onMap,
  onOrganismChange,
  onNamespaceChange,
  onLayoutModeChange,
  onGraphSearchChange,
  onGraphSearchPrevious,
  onGraphSearchNext,
  onGraphSearchClear,
  onFitModeChange,
  onAncestorsChange,
  onDescendantsChange,
  onRandomChildLimitChange,
  onChildLimitChange,
  onIncludeObsoleteChange,
  onToggleRelation,
  onTrimConnectionsChange,
  onZoomOut,
  onFitGraph,
  onZoomIn,
  onExport,
  onExportMetadata,
  onCopySelectedTerms,
  onCopySelectedGenes,
  onShowLegendChange,
  onShowDescendantGenesChange,
  onChooseTerm,
  onChooseGene,
}: SidebarProps) {
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const detailsSectionRef = useRef<HTMLElement | null>(null);
  const detailsHeaderRef = useRef<HTMLButtonElement | null>(null);
  const graphSearchInputRef = useRef<HTMLInputElement | null>(null);
  const previousDetailIdRef = useRef(selectedTerm?.id ?? "");
  const suggestions = inputMode === "go" ? termSuggestions : geneSuggestions;

  function toggleSection(key: SectionKey) {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  }

  useEffect(() => {
    const nextDetailId = selectedTerm?.id ?? "";
    if (!nextDetailId || previousDetailIdRef.current === nextDetailId) {
      return;
    }

    const hadPreviousDetail = Boolean(previousDetailIdRef.current);
    previousDetailIdRef.current = nextDetailId;
    if (!hadPreviousDetail) {
      return;
    }

    setSections((current) => ({ ...current, details: true }));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        detailsSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        detailsHeaderRef.current?.focus({ preventScroll: true });
      });
    });
  }, [selectedTerm?.id]);

  useEffect(() => {
    function handleFindShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") {
        return;
      }
      event.preventDefault();
      if (!expanded) {
        onToggleExpanded();
      }
      setSections((current) => ({ ...current, layout: true }));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          graphSearchInputRef.current?.focus();
          graphSearchInputRef.current?.select();
        });
      });
    }

    window.addEventListener("keydown", handleFindShortcut);
    return () => window.removeEventListener("keydown", handleFindShortcut);
  }, [expanded, onToggleExpanded]);

  return (
    <aside className={`sidebar ${expanded ? "" : "collapsed"}`.trim()}>
      <div className="sidebar-top">
        <div className="brand">
          <Network size={27} />
          {expanded && (
            <div>
              <h1>GONetView</h1>
              <p>v{APP_VERSION} · {stats?.dataVersion ?? "Gene Ontology"}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleExpanded}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      {expanded && (
        <>
          <SidebarSection title="Input" open={sections.input} onToggle={() => toggleSection("input")}>
            <div className="field">
              <span>Search by</span>
              <div className="mode-toggle">
                <button className={inputMode === "go" ? "active" : ""} onClick={() => onInputModeChange("go")}>
                  GO terms
                </button>
                <button className={inputMode === "gene" ? "active" : ""} onClick={() => onInputModeChange("gene")}>
                  Genes
                </button>
              </div>
            </div>

            <label className="field">
              <span>{inputMode === "go" ? "GO terms" : "Genes"}</span>
              <div className="search-box">
                <Search size={18} />
                <textarea
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      onMap(query);
                    }
                  }}
                  placeholder={inputMode === "go" ? "GO:0019319\nGO:0046364" : "TP53\nBRCA1"}
                  rows={3}
                />
              </div>
            </label>

            {suggestions.length > 0 && (
              <div className="suggestions">
                {inputMode === "go"
                  ? termSuggestions.map((term) => (
                      <button key={term.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChooseTerm(term)}>
                        <strong>{term.id}</strong>
                        <span>{term.name}</span>
                      </button>
                    ))
                  : geneSuggestions.map((gene) => (
                      <button key={gene.key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChooseGene(gene)}>
                        <strong>{gene.symbol}</strong>
                        <span>{gene.name || gene.key}</span>
                      </button>
                    ))}
              </div>
            )}

            <div className="actions">
              <button onClick={() => onMap(query)}>
                <GitBranch size={17} />
                {inputMode === "go" ? "Map terms" : "Map genes"}
              </button>
            </div>
            <div className="example-links" aria-label="Saved examples">
              <span>Examples</span>
              {SAVED_EXAMPLES.map((example) => (
                <a key={example.id} href={`?${example.search}`} title={example.summary}>
                  <Bookmark size={14} />
                  {example.label}
                </a>
              ))}
            </div>
            {autoRefreshPending && <div className="status-pill">Updating soon</div>}
          </SidebarSection>

          <SidebarSection title="Scope" open={sections.scope} onToggle={() => toggleSection("scope")}>
            <label className="field">
              <span>Organism</span>
              <select value={organism} onChange={(event) => onOrganismChange(event.target.value)}>
                {organisms.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Namespace</span>
              <select value={namespace} onChange={(event) => onNamespaceChange(event.target.value)}>
                <option value="">All namespaces</option>
                {stats?.namespaces.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <SliderRow label="Ancestor depth" min={0} max={maxAncestorDepth} value={ancestors} onChange={onAncestorsChange} />
            <SliderRow label="Child depth" min={0} max={maxDescendantDepth} value={descendants} onChange={onDescendantsChange} />

            <label className="check-row">
              <input type="checkbox" checked={randomChildLimit} onChange={(event) => onRandomChildLimitChange(event.target.checked)} />
              <span>Random child limit</span>
            </label>

            {randomChildLimit && <SliderRow label="Children per term" min={1} max={100} value={childLimit} onChange={onChildLimitChange} />}

            <label className="check-row">
              <input type="checkbox" checked={includeObsolete} onChange={(event) => onIncludeObsoleteChange(event.target.checked)} />
              <span>Include obsolete terms</span>
            </label>
          </SidebarSection>

          <SidebarSection title="Layout" open={sections.layout} onToggle={() => toggleSection("layout")}>
            <div className="field">
              <span>Layout</span>
              <div className="mode-toggle">
                <button className={layoutMode === "classic" ? "active" : ""} onClick={() => onLayoutModeChange("classic")}>
                  Classic
                </button>
                <button className={layoutMode === "readable" ? "active" : ""} onClick={() => onLayoutModeChange("readable")}>
                  Readable
                </button>
              </div>
            </div>

            <div className="field">
              <span>Fit</span>
              <div className="mode-toggle fit-toggle">
                <button className={fitMode === "height" ? "active" : ""} onClick={() => onFitModeChange("height")}>
                  Fit height
                </button>
                <button className={fitMode === "width" ? "active" : ""} onClick={() => onFitModeChange("width")}>
                  Fit width
                </button>
              </div>
            </div>

            <div className="zoom-block">
              <div className="zoom-actions">
                <button title="Zoom out" onClick={onZoomOut}>
                  <ZoomOut size={18} />
                </button>
                <button title="Fit graph" onClick={onFitGraph}>
                  <RotateCcw size={18} />
                </button>
                <button title="Zoom in" onClick={onZoomIn}>
                  <ZoomIn size={18} />
                </button>
                <output className="zoom-value">{Math.round(scale * 100)}%</output>
              </div>
            </div>

            <label className="check-row">
              <input type="checkbox" checked={trimConnections} onChange={(event) => onTrimConnectionsChange(event.target.checked)} />
              <span>Trim to selected paths</span>
            </label>

            <label className="check-row">
              <input type="checkbox" checked={showLegend} onChange={(event) => onShowLegendChange(event.target.checked)} />
              <span>Show legend</span>
            </label>

            <GraphFindControl
              inputRef={graphSearchInputRef}
              value={graphSearch}
              matchCount={graphSearchMatchCount}
              activeIndex={activeGraphSearchIndex}
              onChange={onGraphSearchChange}
              onPrevious={onGraphSearchPrevious}
              onNext={onGraphSearchNext}
              onClear={onGraphSearchClear}
            />
          </SidebarSection>

          <SidebarSection title="Relations" open={sections.relations} onToggle={() => toggleSection("relations")}>
            <div className="relation-picks">
              {RELATION_STYLES.map((relation) => (
                <label key={relation.key} className="relation-option">
                  <input type="checkbox" checked={selectedRelations.includes(relation.key)} onChange={() => onToggleRelation(relation.key)} />
                  <span className={`relation-line ${relation.dashed ? "dashed" : ""}`} style={legendColorStyle(relation.color)} />
                  <span>{relation.label}</span>
                </label>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection
            title="Details"
            open={sections.details}
            onToggle={() => toggleSection("details")}
            sectionRef={detailsSectionRef}
            headerRef={detailsHeaderRef}
          >
            {stats && (
              <dl className="stats">
                <div>
                  <dt>Terms</dt>
                  <dd>{stats.terms.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>is_a edges</dt>
                  <dd>{stats.edges.toLocaleString()}</dd>
                </div>
              </dl>
            )}

            {selectedTerm && (
              <TermDetail
                selectedTerm={selectedTerm}
                detailGeneCount={detailGeneCount}
                detailGenes={detailGenes}
                showDescendantGenes={showDescendantGenes}
                onShowDescendantGenesChange={onShowDescendantGenesChange}
              />
            )}
          </SidebarSection>

          <SidebarSection title="Export" open={sections.export} onToggle={() => toggleSection("export")}>
            <div className="copy-actions">
              <button title="Copy selected GO IDs" onClick={onCopySelectedTerms}>
                <Clipboard size={15} />
                GO IDs
              </button>
              <button title="Copy selected genes" onClick={onCopySelectedGenes}>
                <Clipboard size={15} />
                Genes
              </button>
            </div>

            <div className="export-actions">
              <button title="Export PNG" onClick={() => onExport("png")}>
                <Download size={15} />
                PNG
              </button>
              <button title="Export SVG" onClick={() => onExport("svg")}>
                <Download size={15} />
                SVG
              </button>
              <button title="Export PDF" onClick={() => onExport("pdf")}>
                <Download size={15} />
                PDF
              </button>
              <button title="Export JSON metadata" onClick={onExportMetadata}>
                <FileJson size={15} />
                JSON
              </button>
            </div>
            {copyStatus && <div className="status-pill">{copyStatus}</div>}
          </SidebarSection>

          <SidebarSection title="References" open={sections.references} onToggle={() => toggleSection("references")}>
            <section className="reference-links">
              <p>
                GONetView is based on the Gene Ontology browsers{" "}
                <a href="https://amigo.geneontology.org/amigo" target="_blank" rel="noreferrer">
                  AmiGO 2
                </a>{" "}
                and{" "}
                <a href="https://www.ebi.ac.uk/QuickGO/" target="_blank" rel="noreferrer">
                  QuickGO
                </a>
                .
              </p>
            </section>
          </SidebarSection>
        </>
      )}
    </aside>
  );
}

function SidebarSection({
  title,
  open,
  onToggle,
  sectionRef,
  headerRef,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  sectionRef?: Ref<HTMLElement>;
  headerRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <section ref={sectionRef} className={`sidebar-section ${open ? "open" : ""}`.trim()}>
      <button ref={headerRef} type="button" className="section-header" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function GraphFindControl({
  inputRef,
  value,
  matchCount,
  activeIndex,
  onChange,
  onPrevious,
  onNext,
  onClear,
}: {
  inputRef: Ref<HTMLInputElement>;
  value: string;
  matchCount: number;
  activeIndex: number;
  onChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClear: () => void;
}) {
  const hasQuery = value.trim().length > 0;
  const hasHits = hasQuery && matchCount > 0 && activeIndex >= 0;
  const counter = hasQuery ? (hasHits ? `${activeIndex + 1}/${matchCount}` : "0/0") : "";

  return (
    <label className="field graph-find-field">
      <span>Graph search</span>
      <div className="graph-find-box">
        <Search size={15} />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (event.shiftKey) {
                onPrevious();
              } else {
                onNext();
              }
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClear();
            }
          }}
          placeholder="GO ID or term name"
        />
        <output className={`find-count ${hasQuery && !hasHits ? "empty" : ""}`.trim()}>{counter}</output>
        <button type="button" title="Previous hit" aria-label="Previous graph search hit" onClick={onPrevious} disabled={!hasHits}>
          <ChevronUp size={16} />
        </button>
        <button type="button" title="Next hit" aria-label="Next graph search hit" onClick={onNext} disabled={!hasHits}>
          <ChevronDown size={16} />
        </button>
        <button type="button" title="Clear search" aria-label="Clear graph search" onClick={onClear} disabled={!hasQuery}>
          <X size={16} />
        </button>
      </div>
    </label>
  );
}

function SliderRow({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider-row">
      <label>
        <span>{label}</span>
        <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </label>
      <output>{value}</output>
    </div>
  );
}

function legendColorStyle(color: string): CSSProperties {
  return { ["--legend-color" as string]: color } as CSSProperties;
}
