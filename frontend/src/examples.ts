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

export const SAVED_EXAMPLES: SavedExample[] = EXAMPLE_STATES.map((example) => ({
  ...example,
  search: serializeUrlState(example.state),
}));
