import { ChevronDown, ChevronUp, Download, ListOrdered, Network, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { enrichmentCsv } from "../enrichment";
import { exportEnrichmentCsv } from "../exportFigure";
import type { EnrichmentResponse, EnrichmentResult } from "../types";
import { formatCount } from "../formatNumber";

// Enough terms to show a shape in the graph, few enough that the readable layout stays quick.
const DEFAULT_TOP_HITS = 15;

type SortKey = "term" | "observed" | "background" | "fold" | "pValue" | "adjustedPValue";

type EnrichmentPanelProps = {
  enrichment: EnrichmentResponse;
  stale: boolean;
  rerunning: boolean;
  onRerun: () => void;
  onMapTerms: (termIds: string[], description: string) => void;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onResize: (height: number) => void;
};

export function EnrichmentPanel({
  enrichment,
  stale,
  rerunning,
  onRerun,
  onMapTerms,
  onClose,
  collapsed,
  onToggleCollapsed,
  onResize,
}: EnrichmentPanelProps) {
  const [filter, setFilter] = useState("");
  const [fdrCutoff, setFdrCutoff] = useState(0.05);
  const [minimumHits, setMinimumHits] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("adjustedPValue");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topHits, setTopHits] = useState(DEFAULT_TOP_HITS);

  const visibleResults = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    const results = enrichment.results.filter((result) => {
      const matchesFilter =
        !normalizedFilter ||
        result.term.id.toLowerCase().includes(normalizedFilter) ||
        result.term.name.toLowerCase().includes(normalizedFilter) ||
        result.term.namespace.toLowerCase().includes(normalizedFilter) ||
        result.genes.some((gene) => gene.symbol.toLowerCase().includes(normalizedFilter));
      return matchesFilter && result.adjustedPValue <= fdrCutoff && result.observed >= minimumHits;
    });
    return results.sort((a, b) => compareResults(a, b, sortKey) * (sortDirection === "asc" ? 1 : -1));
  }, [enrichment.results, fdrCutoff, filter, minimumHits, sortDirection, sortKey]);

  useEffect(() => {
    const significant = enrichment.results.filter((result) => result.adjustedPValue <= 0.05).slice(0, 10);
    setSelected(new Set(significant.map((result) => result.term.id)));
    setFilter("");
    setFdrCutoff(0.05);
    setMinimumHits(1);
    setTopHits(DEFAULT_TOP_HITS);
  }, [enrichment]);

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "term" ? "asc" : nextKey === "fold" || nextKey === "observed" || nextKey === "background" ? "desc" : "asc");
  }

  function toggleResult(termId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  }

  function toggleVisible() {
    const visibleIds = visibleResults.map((result) => result.term.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((termId) => selected.has(termId));
    setSelected((current) => {
      const next = new Set(current);
      for (const termId of visibleIds) {
        if (allSelected) {
          next.delete(termId);
        } else {
          next.add(termId);
        }
      }
      return next;
    });
  }

  // Dragging the top edge sets the panel height directly from the pointer position.
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    function handleMove(moveEvent: PointerEvent) {
      onResize(window.innerHeight - moveEvent.clientY);
    }
    function handleUp() {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", handleUp);
      handle.removeEventListener("pointercancel", handleUp);
    }

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", handleUp);
    handle.addEventListener("pointercancel", handleUp);
  }

  function downloadCsv() {
    exportEnrichmentCsv(enrichmentCsv(enrichment.results), enrichment.organism.key);
  }

  // Ranked by significance regardless of the column the table is sorted by.
  const topResults = [...visibleResults]
    .sort((a, b) => a.adjustedPValue - b.adjustedPValue || a.pValue - b.pValue)
    .slice(0, topHits);
  const allVisibleSelected = visibleResults.length > 0 && visibleResults.every((result) => selected.has(result.term.id));
  const significantCount = enrichment.results.filter((result) => result.adjustedPValue <= fdrCutoff).length;

  return (
    <section
      className={`enrichment-panel ${collapsed ? "collapsed" : ""}`.trim()}
      aria-label="GO enrichment results"
      title={methodSummary(enrichment)}
    >
      <header className="enrichment-header">
        {!collapsed && <div className="enrichment-resize" onPointerDown={startResize} role="presentation" title="Drag to resize" />}
        <div>
          <strong>GO enrichment</strong>
          <span>
            {formatCount(enrichment.queryGenes.length)} query genes · {formatCount(enrichment.backgroundSize)} background genes ·{" "}
            {formatCount(significantCount)} significant at FDR ≤ {fdrCutoff}
          </span>
          {stale && (
            <button type="button" className="enrichment-stale" onClick={onRerun} disabled={rerunning}>
              <RefreshCw size={13} />
              {rerunning ? "Rerunning…" : "Settings changed · rerun"}
            </button>
          )}
        </div>
        <div className="enrichment-header-actions">
          <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? "Expand enrichment results" : "Collapse enrichment results"}>
            {collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close enrichment results">
            <X size={17} />
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <div className="enrichment-controls">
            <label>
              <span>Filter</span>
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Term, GO ID, or gene" />
            </label>
            <label>
              <span>Maximum FDR</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={fdrCutoff}
                onChange={(event) => setFdrCutoff(clamp(Number(event.target.value), 0, 1))}
              />
            </label>
            <label>
              <span>Minimum hits</span>
              <input
                type="number"
                min="1"
                step="1"
                value={minimumHits}
                onChange={(event) => setMinimumHits(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
              />
            </label>
            <label>
              <span>Top hits to map</span>
              <input
                type="number"
                min="1"
                step="1"
                value={topHits}
                onChange={(event) => setTopHits(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
              />
            </label>
            <div className="enrichment-actions">
              <button type="button" className="secondary" onClick={downloadCsv}>
                <Download size={15} /> CSV
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => onMapTerms(topResults.map((result) => result.term.id), `top ${topResults.length} enriched terms by FDR`)}
                disabled={topResults.length === 0}
                title="Map the most significant terms currently listed, strongest first"
              >
                <ListOrdered size={15} /> Map top {Math.min(topHits, visibleResults.length)}
              </button>
              <button
                type="button"
                onClick={() => onMapTerms([...selected], `${selected.size} selected enriched terms`)}
                disabled={selected.size === 0}
              >
                <Network size={15} /> Map selected ({selected.size})
              </button>
            </div>
          </div>


          {(enrichment.missingGenes.length > 0 ||
            enrichment.backgroundMissingGenes.length > 0 ||
            enrichment.outsideBackgroundGenes.length > 0 ||
            enrichment.genesWithoutTerms.length > 0) && (
            <div className="enrichment-warning">
              {enrichment.missingGenes.length > 0 && <span>{enrichment.missingGenes.length} query genes were not found.</span>}
              {enrichment.genesWithoutTerms.length > 0 && <span>{enrichment.genesWithoutTerms.length} query genes had no GO annotations.</span>}
              {enrichment.backgroundMissingGenes.length > 0 && <span>{enrichment.backgroundMissingGenes.length} background genes were not found.</span>}
              {enrichment.outsideBackgroundGenes.length > 0 && <span>{enrichment.outsideBackgroundGenes.length} query genes were outside the custom background.</span>}
            </div>
          )}

          <div className="enrichment-table-wrap">
            <table className="enrichment-table">
              <thead>
                <tr>
                  <th className="select-column">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Select all visible enrichment results" />
                  </th>
                  <SortableHeader label="GO term" sortKey="term" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                  <th>Namespace</th>
                  <SortableHeader label="Hits" sortKey="observed" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                  <SortableHeader label="Background" sortKey="background" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                  <SortableHeader label="Fold" sortKey="fold" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                  <SortableHeader label="P value" sortKey="pValue" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                  <SortableHeader label="FDR" sortKey="adjustedPValue" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
                  <th>Contributing genes</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((result) => (
                  <tr key={result.term.id} className={selected.has(result.term.id) ? "selected" : ""}>
                    <td className="select-column">
                      <input
                        type="checkbox"
                        checked={selected.has(result.term.id)}
                        onChange={() => toggleResult(result.term.id)}
                        aria-label={`Select ${result.term.id}`}
                      />
                    </td>
                    <td className="term-column">
                      <strong>{result.term.id}</strong>
                      <span>{result.term.name}</span>
                    </td>
                    <td>{namespaceLabel(result.term.namespace)}</td>
                    <td>{result.observed}/{result.querySize}</td>
                    <td>{result.backgroundObserved}/{result.backgroundSize}</td>
                    <td>{formatFold(result.foldEnrichment)}</td>
                    <td>{formatProbability(result.pValue)}</td>
                    <td className={result.adjustedPValue <= 0.05 ? "significant" : ""}>{formatProbability(result.adjustedPValue)}</td>
                    <td className="gene-column" title={result.genes.map((gene) => gene.symbol).join(", ")}>
                      {summarizeGenes(result.genes.map((gene) => gene.symbol))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleResults.length === 0 && (
              <div className="enrichment-empty">No results match the current FDR, hit-count, and text filters.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <th>
      <button type="button" className={activeKey === sortKey ? "active" : ""} onClick={() => onSort(sortKey)}>
        {label}
        {activeKey === sortKey && (direction === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </button>
    </th>
  );
}

function compareResults(a: EnrichmentResult, b: EnrichmentResult, key: SortKey): number {
  if (key === "term") return a.term.name.localeCompare(b.term.name);
  if (key === "observed") return a.observed - b.observed;
  if (key === "background") return a.backgroundObserved - b.backgroundObserved;
  if (key === "fold") return a.foldEnrichment - b.foldEnrichment;
  if (key === "pValue") return a.pValue - b.pValue;
  return a.adjustedPValue - b.adjustedPValue;
}

function formatProbability(value: number): string {
  if (value === 0) return "<1e-300";
  if (value < 0.001) return value.toExponential(2);
  return value.toFixed(3);
}

function formatFold(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 1 : 2)}×` : "—";
}

function summarizeGenes(genes: string[]): string {
  if (genes.length <= 4) return genes.join(", ");
  return `${genes.slice(0, 4).join(", ")} +${genes.length - 4}`;
}

// The panel shows no explanatory paragraph; this is its hover summary, and the same facts are
// written into the JSON metadata export.
function methodSummary(enrichment: EnrichmentResponse): string {
  const parts = [
    `One-sided hypergeometric test across ${formatCount(enrichment.testedTerms)} terms, Benjamini-Hochberg corrected within each namespace (${describeNamespaceCounts(enrichment.testedTermsByNamespace)}).`,
    describeTermSizeLimits(enrichment.minTermSize, enrichment.maxTermSize).trim(),
    enrichment.propagated ? "Annotations include is_a and part_of ancestors." : "Only direct annotations were tested.",
    enrichment.evidenceMode === "curated"
      ? `Electronic (IEA) annotations excluded, dropping ${formatCount(enrichment.excludedWithoutCuratedEvidence)} genes left without any.`
      : "All evidence codes used, including electronic (IEA) annotations.",
    enrichment.backgroundMode === "annotated"
      ? `Background: ${formatCount(enrichment.backgroundSize)} annotated gene products (${enrichment.backgroundSources.join(", ")}); ${formatCount(enrichment.excludedEntities)} complexes and ncRNA entities excluded.`
      : `Background: ${formatCount(enrichment.backgroundSize)} genes from the custom list.`,
    enrichment.redundancyReduced
      ? `Redundancy reduction hid ${formatCount(enrichment.redundantTermsRemoved)} parent terms covered by a stronger descendant.`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function describeTermSizeLimits(minTermSize: number, maxTermSize: number): string {
  const hasMinimum = minTermSize > 1;
  const hasMaximum = maxTermSize > 0;
  if (hasMinimum && hasMaximum) {
    return ` Terms outside ${formatCount(minTermSize)}–${formatCount(maxTermSize)} background genes were not tested.`;
  }
  if (hasMinimum) {
    return ` Terms with fewer than ${formatCount(minTermSize)} background genes were not tested.`;
  }
  if (hasMaximum) {
    return ` Terms with more than ${formatCount(maxTermSize)} background genes were not tested.`;
  }
  return " Terms of every size were tested.";
}

function describeNamespaceCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return "no terms tested";
  }
  return entries.map(([namespace, count]) => `${namespaceLabel(namespace)} ${formatCount(count)}`).join(", ");
}

function namespaceLabel(namespace: string): string {
  return namespace
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
