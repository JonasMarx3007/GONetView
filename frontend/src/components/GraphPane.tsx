import { Loader2, PanelLeftOpen } from "lucide-react";
import type { RefObject } from "react";
import { edgeKey, type ConnectionGraph } from "../graphConnections";
import type { LayoutGraph } from "../layout";
import { wrapName } from "../layout";
import { PlotLegend } from "./PlotLegend";
import { namespaceClass, relationClass } from "../theme";
import type { GraphResponse } from "../types";

type GraphPaneProps = {
  sidebarExpanded: boolean;
  graph: GraphResponse | null;
  trimConnections: boolean;
  connectionGraph: ConnectionGraph | null;
  selectedTerms: string[];
  layoutNotice: string;
  error: string;
  autoRefreshPending: boolean;
  graphSearch: string;
  searchMatchIds: Set<string>;
  activeSearchMatchId: string;
  canvasRef: RefObject<HTMLDivElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  loading: boolean;
  loadingStage: string;
  buildingConnections: boolean;
  layouting: boolean;
  laidOut: LayoutGraph | null;
  svgExtraWidth: number;
  scale: number;
  showLegend: boolean;
  selectedRelations: string[];
  onExpandSidebar: () => void;
  onSelectNode: (id: string) => void;
  onOpenNode: (id: string) => void;
};

export function GraphPane({
  sidebarExpanded,
  graph,
  trimConnections,
  connectionGraph,
  selectedTerms,
  layoutNotice,
  error,
  autoRefreshPending,
  graphSearch,
  searchMatchIds,
  activeSearchMatchId,
  canvasRef,
  svgRef,
  loading,
  loadingStage,
  buildingConnections,
  layouting,
  laidOut,
  svgExtraWidth,
  scale,
  showLegend,
  selectedRelations,
  onExpandSidebar,
  onSelectNode,
  onOpenNode,
}: GraphPaneProps) {
  return (
    <main className="graph-pane">
      {!sidebarExpanded && (
        <button
          type="button"
          className="sidebar-float-toggle"
          onClick={onExpandSidebar}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}
      <div className={`graph-toolbar ${sidebarExpanded ? "" : "with-floating-toggle"}`.trim()}>
        <span>{graph ? `${graph.nodes.length.toLocaleString()} nodes / ${graph.edges.length.toLocaleString()} edges` : "Loading GO"}</span>
        {trimConnections && connectionGraph && <strong>{connectionGraph.nodes.length.toLocaleString()} visible after trim</strong>}
        {graph?.truncated && <strong>Limited graph</strong>}
        {selectedTerms.length > 1 && <strong>{selectedTerms.length} selected terms</strong>}
        {graph?.selectedGenes && graph.selectedGenes.length > 0 && <strong>{graph.selectedGenes.length} selected genes</strong>}
        {graph?.missingTerms && graph.missingTerms.length > 0 && <strong>{graph.missingTerms.length} ignored GO terms</strong>}
        {graphSearch.trim() && <strong>{searchMatchIds.size.toLocaleString()} graph search hits</strong>}
        {autoRefreshPending && <strong className="notice">Updating soon</strong>}
        {layoutNotice && <strong className="notice">{layoutNotice}</strong>}
        {error && <strong className="error">{error}</strong>}
      </div>

      <div className="canvas" ref={canvasRef}>
        {(loading || buildingConnections || layouting) && (
          <div className="loading">
            <Loader2 size={28} />
            <span>{loading ? loadingStage : buildingConnections ? "Finding selected paths" : "Arranging readable layout"}</span>
          </div>
        )}
        {laidOut && !loading && !buildingConnections && (
          <svg
            ref={svgRef}
            className="go-graph"
            width={(laidOut.width + svgExtraWidth) * scale}
            height={laidOut.height * scale}
            viewBox={`0 0 ${laidOut.width + svgExtraWidth} ${laidOut.height}`}
            role="img"
            aria-label="Gene Ontology relation graph"
          >
            <g className="edges">
              {laidOut.edges.map((edge) => (
                <g
                  key={edgeKey(edge.source, edge.target, edge.relation)}
                  className={`${relationClass(edge.relation)} ${connectionGraph?.edgeClasses.get(edgeKey(edge.source, edge.target, edge.relation)) ?? ""}`.trim()}
                >
                  <path d={edge.path} />
                  <path d={edge.markerPath} className="arrow-head" />
                </g>
              ))}
            </g>
            <g className="nodes">
              {laidOut.nodes.map((node) => (
                <g
                  key={node.id}
                  className={`go-node ${namespaceClass(node.namespace)} ${selectedTerms.includes(node.id) ? "selected" : ""} ${searchMatchIds.has(node.id) ? "search-hit" : ""} ${activeSearchMatchId === node.id ? "active-search-hit" : ""} ${node.obsolete ? "obsolete" : ""}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => onSelectNode(node.id)}
                  onDoubleClick={() => onOpenNode(node.id)}
                >
                  {searchMatchIds.has(node.id) && (
                    <rect className="search-ring" x={-7} y={-7} width={node.width + 14} height={node.height + 14} rx={7} />
                  )}
                  <rect className="body" width={node.width} height={node.height} />
                  <rect className="header" width={node.width} height={30} />
                  <text className="id" x={node.width / 2} y={21}>
                    {node.id}
                  </text>
                  {wrapName(node.name).map((line, index, lines) => (
                    <text
                      key={line}
                      className="name"
                      x={node.width / 2}
                      y={48 + index * 23 + Math.max(0, 3 - lines.length) * 7}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              ))}
            </g>
            {showLegend && <PlotLegend x={laidOut.width + 18} y={18} selectedRelations={selectedRelations} />}
          </svg>
        )}
      </div>
    </main>
  );
}
