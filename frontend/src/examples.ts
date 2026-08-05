import type { UrlAppState } from "./urlState";
import { serializeUrlState } from "./urlState";

export type SavedExample = {
  id: string;
  label: string;
  summary: string;
  state: UrlAppState;
  search: string;
};

const TUTORIAL_RELATIONS = ["is_a", "part_of", "regulates", "positively_regulates", "negatively_regulates"];

const EXAMPLE_STATES: Array<Omit<SavedExample, "search">> = [
  {
    id: "t-cell-process-map",
    label: "T-cell process map",
    summary: "Three T-cell GO terms connected by trimmed parent paths.",
    state: {
      inputMode: "go",
      query: "GO:0050852\nGO:0002456\nGO:0045065",
      organism: "goa_human",
      namespace: "biological_process",
      ancestors: 10,
      descendants: 0,
      selectedRelations: TUTORIAL_RELATIONS,
      layoutMode: "readable",
      trimConnections: true,
      showLegend: true,
      fitMode: "height",
      graphSearch: "activation",
    },
  },
  {
    id: "cd8a-gene-map",
    label: "CD8A gene map",
    summary: "Human CD8A annotations with the same trimmed network settings.",
    state: {
      inputMode: "gene",
      query: "CD8A",
      organism: "goa_human",
      namespace: "biological_process",
      ancestors: 10,
      descendants: 0,
      selectedRelations: TUTORIAL_RELATIONS,
      layoutMode: "readable",
      trimConnections: true,
      showLegend: true,
      fitMode: "height",
    },
  },
];

const ENRICHMENT_EXAMPLE_STATES: Array<Omit<SavedExample, "search">> = [
  {
    id: "dna-damage-gene-set",
    label: "DNA damage gene set",
    summary: "Ten human DNA damage response genes, tested on curated evidence without redundant parents.",
    state: {
      organism: "goa_human",
      enrichmentQuery: "TP53\nBRCA1\nBRCA2\nATM\nCHEK2\nRAD51\nMDM2\nCDKN1A\nBAX\nPARP1",
      enrichmentPropagate: true,
      enrichmentCuratedOnly: true,
      enrichmentReduceRedundancy: true,
      autoRunEnrichment: true,
      layoutMode: "readable",
      fitMode: "height",
      showLegend: true,
    },
  },
  {
    id: "glycolysis-gene-set",
    label: "Glycolysis gene set",
    summary: "Eight glycolytic enzymes, tested with the default settings.",
    state: {
      organism: "goa_human",
      enrichmentQuery: "HK1\nGPI\nPFKM\nALDOA\nGAPDH\nPGK1\nENO1\nPKM",
      enrichmentPropagate: true,
      autoRunEnrichment: true,
      layoutMode: "readable",
      fitMode: "height",
      showLegend: true,
    },
  },
];

function withSearch(examples: Array<Omit<SavedExample, "search">>): SavedExample[] {
  return examples.map((example) => ({ ...example, search: serializeUrlState(example.state) }));
}

export const SAVED_EXAMPLES: SavedExample[] = withSearch(EXAMPLE_STATES);
export const ENRICHMENT_EXAMPLES: SavedExample[] = withSearch(ENRICHMENT_EXAMPLE_STATES);
