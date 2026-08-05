import type { GeneRecord, GOTerm } from "../types";
import { formatCount } from "../formatNumber";

type TermDetailProps = {
  selectedTerm: GOTerm;
  detailGeneCount: number;
  detailGenes: GeneRecord[];
  showDescendantGenes: boolean;
  onShowDescendantGenesChange: (value: boolean) => void;
};

export function TermDetail({
  selectedTerm,
  detailGeneCount,
  detailGenes,
  showDescendantGenes,
  onShowDescendantGenesChange,
}: TermDetailProps) {
  return (
    <section className="term-detail">
      <h2>{selectedTerm.id}</h2>
      <h3>{selectedTerm.name}</h3>
      <dl className="term-counts">
        <div>
          <dt>Parents</dt>
          <dd>{formatCount(selectedTerm.parentCount)}</dd>
        </div>
        <div>
          <dt>Children</dt>
          <dd>{formatCount(selectedTerm.childCount)}</dd>
        </div>
        <div>
          <dt>{showDescendantGenes ? "Genes+" : "Genes"}</dt>
          <dd>{formatCount(detailGeneCount)}</dd>
        </div>
      </dl>
      <label className="check-row term-check">
        <input
          type="checkbox"
          checked={showDescendantGenes}
          onChange={(event) => onShowDescendantGenesChange(event.target.checked)}
        />
        <span>Show descendant genes</span>
      </label>
      <p>{selectedTerm.definition}</p>
      {detailGenes.length > 0 && (
        <div className="gene-list">
          <h4>{showDescendantGenes ? "Genes from term and descendants" : "Direct genes"}</h4>
          <ul>
            {detailGenes.map((gene) => (
              <li key={gene.key}>
                <strong>{gene.symbol}</strong>
                <span>{gene.name || gene.objectId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
