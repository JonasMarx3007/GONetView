import { NAMESPACE_STYLES, RELATION_STYLES } from "../theme";

export function PlotLegend({ x, y, selectedRelations }: { x: number; y: number; selectedRelations: string[] }) {
  const relationEntries = RELATION_STYLES.filter((relation) => selectedRelations.includes(relation.key));
  const namespaceEntries = [
    NAMESPACE_STYLES.biological_process,
    NAMESPACE_STYLES.molecular_function,
    NAMESPACE_STYLES.cellular_component,
  ];

  return (
    <g className="plot-legend" transform={`translate(${x}, ${y})`}>
      {namespaceEntries.map((entry, index) => (
        <g key={entry.label} transform={`translate(0, ${index * 34})`}>
          <rect width="138" height="22" fill={entry.header} />
          <text x="69" y="15" textAnchor="middle" className="legend-namespace-label">
            {entry.label}
          </text>
        </g>
      ))}

      {relationEntries.map((relation, index) => {
        const top = 138 + index * 50;
        return (
          <g key={relation.key} transform={`translate(0, ${top})`}>
            <text x="82" y="-10" textAnchor="middle" className="legend-relation-label">
              {relation.label}
            </text>
            <rect x="0" y="-8" width="24" height="24" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
            <text x="12" y="8" textAnchor="middle" className="legend-box-label">
              A
            </text>
            <line
              x1="32"
              y1="4"
              x2="132"
              y2="4"
              stroke={relation.color}
              strokeWidth="2.8"
              strokeDasharray={relation.dashed ? "6 4" : undefined}
            />
            <path d="M 132 4 L 124 0 L 124 8 Z" fill={relation.color} />
            <rect x="146" y="-8" width="24" height="24" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
            <text x="158" y="8" textAnchor="middle" className="legend-box-label">
              B
            </text>
          </g>
        );
      })}
    </g>
  );
}
