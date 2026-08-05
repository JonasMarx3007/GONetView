export type GOTerm = {
  id: string;
  name: string;
  namespace: string;
  definition: string;
  parentCount: number;
  childCount: number;
  level: number;
  obsolete: boolean;
  geneCount?: number;
  genes?: GeneRecord[];
};

export type GeneRecord = {
  key: string;
  db: string;
  objectId: string;
  symbol: string;
  name: string;
  taxon: string;
  termCount: number;
};

export type Organism = {
  key: string;
  label: string;
  file: string;
  size: number;
};

export type GOEdge = {
  source: string;
  target: string;
  relation: string;
};

export type GraphResponse = {
  selected: string;
  selectedTerms: string[];
  missingTerms?: string[];
  selectedGenes?: GeneRecord[];
  missingGenes?: string[];
  genesWithoutTerms?: GeneRecord[];
  truncated: boolean;
  organism?: Organism;
  annotationDate?: string | null;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  nodes: GOTerm[];
  edges: GOEdge[];
};

export type StatsResponse = {
  terms: number;
  edges: number;
  namespaces: string[];
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  dataVersion: string | null;
  source: string;
  generatedAt: string;
};

export type EnrichmentResult = {
  term: GOTerm;
  observed: number;
  querySize: number;
  backgroundObserved: number;
  backgroundSize: number;
  expected: number;
  foldEnrichment: number;
  pValue: number;
  adjustedPValue: number;
  genes: GeneRecord[];
};

export type EnrichmentResponse = {
  organism: Organism;
  annotationDate: string | null;
  queryGenes: GeneRecord[];
  missingGenes: string[];
  genesWithoutTerms: GeneRecord[];
  backgroundMode: "annotated" | "custom";
  backgroundSize: number;
  backgroundSources: string[];
  backgroundKind: "gene-products" | "all-entities";
  excludedEntities: number;
  excludedWithoutCuratedEvidence: number;
  evidenceMode: "all" | "curated";
  backgroundMissingGenes: string[];
  outsideBackgroundGenes: GeneRecord[];
  testedTerms: number;
  testedTermsByNamespace: Record<string, number>;
  minTermSize: number;
  maxTermSize: number;
  propagated: boolean;
  redundancyReduced: boolean;
  redundantTermsRemoved: number;
  results: EnrichmentResult[];
};
