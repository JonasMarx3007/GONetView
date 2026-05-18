import type { GeneRecord, GOEdge, GOTerm, GraphResponse, Organism, StatsResponse } from "./types";
import { fetchJson, fetchJsonCached } from "./dataCache";

type RawRelation = [target: string, type: string];

type RawTerm = {
  id: string;
  name: string;
  namespace: string;
  definition: string;
  parents: string[];
  relations: RawRelation[];
  obsolete: boolean;
  level: number;
};

type OntologyManifest = {
  generatedAt: string;
  stats: StatsResponse;
  organisms: Organism[];
  files: {
    terms: string;
    termSearch?: string;
  };
};

type LegacyOntologyIndex = OntologyManifest & {
  terms: RawTerm[];
};

type AnnotationManifest = {
  organism: Organism;
  dateGenerated: string | null;
  generatedAt: string;
  files: {
    genes: string;
    geneSearch?: string;
    termToGenes: string;
    geneToTerms: string;
    aliases: string;
  };
};

type GeneSearchRecord = GeneRecord & {
  search: string;
};

type TermSearchRecord = GOTerm & {
  search: string;
};

type LegacyAnnotationIndex = {
  organism: Organism;
  dateGenerated: string | null;
  genes: GeneRecord[];
  termToGenes: Record<string, string[]>;
  geneToTerms: Record<string, string[]>;
  aliases: Record<string, string[]>;
};

const BASE_PATH = normalizeBasePath(import.meta.env.VITE_BASE_PATH ?? import.meta.env.BASE_URL ?? "/");
const DATA_BASE = `${BASE_PATH}/data`;
const DEFAULT_TERM = "GO:0019319";
const DEFAULT_ORGANISM = "goa_human";

let ontologyPromise: Promise<BrowserOntology> | null = null;
const annotationPromises = new Map<string, Promise<BrowserAnnotations>>();

class BrowserOntology {
  readonly termsById: Map<string, RawTerm>;
  readonly nameIndex: Map<string, string>;
  readonly children: Map<string, string[]>;
  readonly relationChildren: Map<string, RawRelation[]>;
  readonly searchRows: Array<{ term: RawTerm; text: string }>;
  termSearchPromise: Promise<TermSearchRecord[]> | null = null;

  constructor(
    readonly manifest: OntologyManifest,
    readonly terms: RawTerm[],
  ) {
    this.termsById = new Map(terms.map((term) => [term.id, term]));
    this.nameIndex = new Map(terms.map((term) => [term.name.trim().toLowerCase(), term.id]));
    this.searchRows = terms.map((term) => ({ term, text: `${term.id} ${term.name}`.toLowerCase() }));
    this.children = new Map();
    this.relationChildren = new Map();

    for (const term of terms) {
      for (const parent of term.parents) {
        pushMap(this.children, parent, term.id);
      }
      for (const [target, type] of term.relations) {
        pushMap(this.relationChildren, target, [term.id, type]);
      }
    }

    for (const [key, values] of this.children) {
      this.children.set(key, [...new Set(values)].sort());
    }
    for (const [key, values] of this.relationChildren) {
      this.relationChildren.set(key, uniqueRelations(values));
    }
  }

  termJson(term: RawTerm, termToGenes?: Record<string, string[]>): GOTerm {
    return {
      id: term.id,
      name: term.name,
      namespace: term.namespace,
      definition: term.definition,
      parentCount: term.parents.length,
      childCount: this.children.get(term.id)?.length ?? 0,
      level: term.level,
      obsolete: term.obsolete,
      ...(termToGenes ? { geneCount: termToGenes[term.id]?.length ?? 0 } : {}),
    };
  }

  async search(query: string, namespace: string, limit: number, includeObsolete: boolean): Promise<GOTerm[]> {
    if (this.manifest.files.termSearch) {
      const rows = await this.termSearch();
      const q = query.trim().toLowerCase();
      const normalized = normalizeSearch(q);
      const matches: Array<[number, TermSearchRecord]> = [];
      for (const term of rows) {
        if (!includeObsolete && term.obsolete) {
          continue;
        }
        if (namespace && term.namespace !== namespace) {
          continue;
        }
        if (q && !term.search.includes(q) && !term.search.includes(normalized)) {
          continue;
        }
        const id = term.id.toLowerCase();
        const bareId = id.replace(":", "");
        const name = term.name.toLowerCase();
        const score = id === q ? 0 : id.startsWith(q) || bareId.startsWith(normalized) ? 1 : name.startsWith(q) ? 2 : 3;
        matches.push([score, term]);
      }
      return matches
        .sort((a, b) => a[0] - b[0] || a[1].id.localeCompare(b[1].id))
        .slice(0, limit)
        .map(([, term]) => stripTermSearch(term));
    }

    const q = query.trim().toLowerCase();
    const matches: GOTerm[] = [];
    for (const { term, text } of this.searchRows) {
      if (!includeObsolete && term.obsolete) {
        continue;
      }
      if (namespace && term.namespace !== namespace) {
        continue;
      }
      if (q && !text.includes(q)) {
        continue;
      }
      matches.push(this.termJson(term));
      if (matches.length >= limit) {
        break;
      }
    }
    return matches;
  }

  private async termSearch(): Promise<TermSearchRecord[]> {
    this.termSearchPromise ??= fetchJsonCached<TermSearchRecord[]>(
      dataUrl(this.manifest.files.termSearch as string),
      this.manifest.generatedAt,
    );
    return this.termSearchPromise;
  }

  normalizeTerms(values: string[], includeObsolete: boolean): { valid: string[]; missing: string[] } {
    const valid: string[] = [];
    const missing: string[] = [];
    for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
      const normalizedId = value.toUpperCase();
      const byId = this.termsById.get(normalizedId);
      if (byId && (includeObsolete || !byId.obsolete)) {
        pushUnique(valid, normalizedId);
        continue;
      }

      const byName = this.nameIndex.get(value.toLowerCase());
      const namedTerm = byName ? this.termsById.get(byName) : undefined;
      if (byName && namedTerm && (includeObsolete || !namedTerm.obsolete)) {
        pushUnique(valid, byName);
        continue;
      }

      missing.push(value);
    }
    return { valid, missing };
  }

  descendantsOf(termId: string): string[] {
    if (!this.termsById.has(termId)) {
      throw new Error(`Unknown GO term: ${termId}`);
    }
    const descendants = new Set<string>();
    const queue = [termId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const child of this.children.get(current) ?? []) {
        if (descendants.has(child)) {
          continue;
        }
        descendants.add(child);
        queue.push(child);
      }
    }
    return [...descendants];
  }

  subgraphForTerms(
    values: string[],
    ancestors: number,
    descendants: number,
    namespace: string,
    limit: number,
    randomChildLimit: number | null,
    includeObsolete: boolean,
    relations: string[],
  ): { nodes: RawTerm[]; edges: GOEdge[]; selectedTerms: string[]; missingTerms: string[]; truncated: boolean } {
    const { valid: requested, missing } = this.normalizeTerms(values, includeObsolete);
    if (requested.length === 0) {
      throw new Error(missing.length > 0 ? "None of the entered GO terms exist in the current ontology" : "At least one GO term is required");
    }

    const relationFilter = unique(relations.length > 0 ? relations : ["is_a"]);
    const selected = new Set(requested);
    const protectedNodes = new Set(requested);
    const perSeedLimit = Math.max(1, Math.floor(limit / Math.max(1, requested.length)));

    for (const termId of requested) {
      const parents = this.walk(termId, "parents", ancestors, limit, null, relationFilter, includeObsolete);
      for (const parent of parents) {
        protectedNodes.add(parent);
        selected.add(parent);
      }
      for (const child of this.walk(termId, "children", descendants, perSeedLimit, randomChildLimit, relationFilter, includeObsolete)) {
        selected.add(child);
      }
    }

    for (const nodeId of [...selected]) {
      const term = this.termsById.get(nodeId);
      if (!term || (namespace && term.namespace !== namespace) || (!includeObsolete && term.obsolete)) {
        selected.delete(nodeId);
        protectedNodes.delete(nodeId);
      }
    }

    const truncated = selected.size > limit;
    if (truncated) {
      const remaining = [...selected].filter((nodeId) => !protectedNodes.has(nodeId)).sort();
      const next = new Set([...protectedNodes].sort().slice(0, limit));
      for (const nodeId of remaining.slice(0, Math.max(0, limit - next.size))) {
        next.add(nodeId);
      }
      selected.clear();
      for (const nodeId of next) {
        selected.add(nodeId);
      }
    }

    const relationSet = new Set(relationFilter);
    const nodes = [...selected].sort().map((nodeId) => this.termsById.get(nodeId)).filter((term): term is RawTerm => Boolean(term));
    const edges = nodes.flatMap((term) =>
      term.relations
        .filter(([target, type]) => relationSet.has(type) && selected.has(target))
        .map(([target, type]) => ({ source: term.id, target, relation: type })),
    );

    return { nodes, edges, selectedTerms: requested, missingTerms: missing, truncated };
  }

  private walk(
    startId: string,
    direction: "parents" | "children",
    maxDepth: number,
    hardLimit: number,
    randomChildLimit: number | null,
    relations: string[],
    includeObsolete: boolean,
  ): string[] {
    if (maxDepth <= 0) {
      return [];
    }

    const relationSet = new Set(relations);
    const seen = new Set<string>();
    const queue: Array<[string, number]> = [[startId, 0]];
    for (let cursor = 0; cursor < queue.length && seen.size < hardLimit; cursor += 1) {
      const [nodeId, depth] = queue[cursor];
      if (depth >= maxDepth) {
        continue;
      }

      const neighbors =
        direction === "parents"
          ? this.parentsForWalk(nodeId, relationSet)
          : this.childrenForWalk(nodeId, randomChildLimit, relationSet);
      for (const neighbor of neighbors) {
        const term = this.termsById.get(neighbor);
        if (seen.has(neighbor) || !term || (!includeObsolete && term.obsolete)) {
          continue;
        }
        seen.add(neighbor);
        queue.push([neighbor, depth + 1]);
      }
    }
    return [...seen];
  }

  private parentsForWalk(nodeId: string, relationSet: Set<string>): string[] {
    const term = this.termsById.get(nodeId);
    return term?.relations.filter(([, type]) => relationSet.has(type)).map(([target]) => target) ?? [];
  }

  private childrenForWalk(nodeId: string, randomChildLimit: number | null, relationSet: Set<string>): string[] {
    const children = unique((this.relationChildren.get(nodeId) ?? []).filter(([, type]) => relationSet.has(type)).map(([target]) => target));
    if (randomChildLimit === null || children.length <= randomChildLimit) {
      return children;
    }
    return deterministicSample(children, randomChildLimit);
  }
}

class BrowserAnnotations {
  geneSearchPromise: Promise<GeneSearchRecord[]> | null = null;
  genesPromise: Promise<GeneRecord[]> | null = null;
  genesByKeyPromise: Promise<Map<string, GeneRecord>> | null = null;
  aliasesPromise: Promise<Record<string, string[]>> | null = null;
  geneToTermsPromise: Promise<Record<string, string[]>> | null = null;
  termToGenesPromise: Promise<Record<string, string[]>> | null = null;

  constructor(readonly manifest: AnnotationManifest) {}

  async search(query: string, limit: number): Promise<GeneRecord[]> {
    const genes = await this.geneSearch();
    const q = query.trim().toLowerCase();
    if (!q) {
      return genes.slice(0, limit).map(stripGeneSearch);
    }

    const normalized = normalizeSearch(q.replace(/^.*:/, ""));
    const matches: Array<[number, GeneSearchRecord]> = [];
    for (const record of genes) {
      if (!record.search.includes(q) && !record.search.includes(normalized)) {
        continue;
      }
      const exact = [record.symbol.toLowerCase(), record.objectId.toLowerCase(), `${record.db}:${record.objectId}`.toLowerCase()].includes(q);
      const starts =
        record.symbol.toLowerCase().startsWith(q) ||
        record.objectId.toLowerCase().startsWith(q) ||
        record.symbol.toLowerCase().startsWith(normalized) ||
        record.objectId.toLowerCase().startsWith(normalized);
      const symbolHit = record.symbol.toLowerCase().includes(q) || record.symbol.toLowerCase().includes(normalized);
      matches.push([exact ? 0 : starts ? 1 : symbolHit ? 2 : 3, record]);
    }
    return matches
      .sort((a, b) => a[0] - b[0] || a[1].symbol.localeCompare(b[1].symbol))
      .slice(0, limit)
      .map(([, record]) => stripGeneSearch(record));
  }

  async resolveGenes(values: string[]): Promise<{ genes: GeneRecord[]; terms: string[]; missing: string[] }> {
    const [aliases, geneToTerms] = await Promise.all([this.aliases(), this.geneToTerms()]);
    const geneKeys: string[] = [];
    const missing: string[] = [];
    for (const value of values) {
      const keys = aliases[normalizeGene(value)] ?? [];
      if (keys.length === 0) {
        missing.push(value);
        continue;
      }
      for (const key of keys) {
        pushUnique(geneKeys, key);
      }
    }

    const terms: string[] = [];
    for (const key of geneKeys) {
      for (const term of geneToTerms[key] ?? []) {
        pushUnique(terms, term);
      }
    }

    return { genes: await this.recordsForKeys(geneKeys, geneKeys.length), terms, missing };
  }

  async recordsForTerms(termIds: string[], limit: number): Promise<{ geneCount: number; genes: GeneRecord[] }> {
    const [termToGenes, genesByKey] = await Promise.all([this.termToGenes(), this.genesByKey()]);
    const keys = new Set<string>();
    for (const termId of termIds) {
      for (const key of termToGenes[termId] ?? []) {
        keys.add(key);
      }
    }
    const sortedKeys = [...keys].sort((a, b) => (genesByKey.get(a)?.symbol ?? a).localeCompare(genesByKey.get(b)?.symbol ?? b));
    return { geneCount: sortedKeys.length, genes: await this.recordsForKeys(sortedKeys, limit) };
  }

  async termToGenes(): Promise<Record<string, string[]>> {
    this.termToGenesPromise ??= this.chunk<Record<string, string[]>>(this.manifest.files.termToGenes);
    return this.termToGenesPromise;
  }

  private async recordsForKeys(keys: string[], limit: number): Promise<GeneRecord[]> {
    const genesByKey = await this.genesByKey();
    const capped = limit > 0 ? keys.slice(0, limit) : keys;
    return capped.map((key) => genesByKey.get(key)).filter((gene): gene is GeneRecord => Boolean(gene));
  }

  private async genes(): Promise<GeneRecord[]> {
    this.genesPromise ??= this.chunk<GeneRecord[]>(this.manifest.files.genes);
    return this.genesPromise;
  }

  private async geneSearch(): Promise<GeneSearchRecord[]> {
    this.geneSearchPromise ??= this.manifest.files.geneSearch
      ? this.chunk<GeneSearchRecord[]>(this.manifest.files.geneSearch)
      : this.genes().then((genes) =>
          genes.map((gene) => ({
            ...gene,
            search: `${gene.symbol} ${gene.objectId} ${gene.db}:${gene.objectId} ${gene.name}`.toLowerCase(),
          })),
        );
    return this.geneSearchPromise;
  }

  private async genesByKey(): Promise<Map<string, GeneRecord>> {
    this.genesByKeyPromise ??= this.genes().then((genes) => new Map(genes.map((gene) => [gene.key, gene])));
    return this.genesByKeyPromise;
  }

  private async aliases(): Promise<Record<string, string[]>> {
    this.aliasesPromise ??= this.chunk<Record<string, string[]>>(this.manifest.files.aliases);
    return this.aliasesPromise;
  }

  private async geneToTerms(): Promise<Record<string, string[]>> {
    this.geneToTermsPromise ??= this.chunk<Record<string, string[]>>(this.manifest.files.geneToTerms);
    return this.geneToTermsPromise;
  }

  private chunk<T>(file: string): Promise<T> {
    return fetchJsonCached<T>(dataUrl(file), this.manifest.generatedAt);
  }
}

export async function fetchStats(): Promise<StatsResponse> {
  return (await loadOntology()).manifest.stats;
}

export async function searchTerms(query: string, namespace: string, includeObsolete: boolean): Promise<GOTerm[]> {
  return (await loadOntology()).search(query, namespace, 30, includeObsolete);
}

export async function fetchOrganisms(): Promise<Organism[]> {
  return (await loadOntology()).manifest.organisms;
}

export async function searchGenes(query: string, organism: string): Promise<GeneRecord[]> {
  return (await loadAnnotations(organism || DEFAULT_ORGANISM)).search(query, 30);
}

export async function fetchTermGenes(
  termId: string,
  organism: string,
  includeDescendants: boolean,
): Promise<{ geneCount: number; genes: GeneRecord[]; includeDescendants: boolean }> {
  const ontology = await loadOntology();
  const annotations = await loadAnnotations(organism || DEFAULT_ORGANISM);
  const termIds = includeDescendants ? [termId, ...ontology.descendantsOf(termId).sort()] : [termId];
  return { ...(await annotations.recordsForTerms(termIds, 500)), includeDescendants };
}

export async function fetchFocusedGraph(
  mode: "go" | "gene",
  values: string[],
  organism: string,
  ancestors: number,
  descendants: number,
  namespace: string,
  randomChildLimit: boolean,
  childLimit: number,
  includeObsolete: boolean,
  relations: string[],
): Promise<GraphResponse> {
  const ontology = await loadOntology();
  let annotations: BrowserAnnotations | undefined;
  let geneResolution: Awaited<ReturnType<BrowserAnnotations["resolveGenes"]>> | undefined;
  let termValues = values;

  if (mode === "gene") {
    annotations = await loadAnnotations(organism || DEFAULT_ORGANISM);
    geneResolution = await annotations.resolveGenes(values);
    if (geneResolution.terms.length === 0) {
      const missing = geneResolution.missing.join(", ") || values.join(", ");
      throw new Error(`No GO terms found for gene input: ${missing}`);
    }
    termValues = geneResolution.terms;
  } else if (organism) {
    annotations = await loadAnnotations(organism);
  }

  const graph = ontology.subgraphForTerms(
    termValues.length > 0 ? termValues : [DEFAULT_TERM],
    ancestors,
    descendants,
    namespace,
    4000,
    randomChildLimit ? childLimit : null,
    includeObsolete,
    relations,
  );
  const termToGenes = annotations ? await annotations.termToGenes() : undefined;

  return {
    selected: graph.selectedTerms[0] ?? "",
    selectedTerms: graph.selectedTerms,
    missingTerms: graph.missingTerms,
    selectedGenes: geneResolution?.genes,
    missingGenes: geneResolution?.missing,
    truncated: graph.truncated,
    organism: annotations?.manifest.organism,
    annotationDate: annotations?.manifest.dateGenerated,
    maxAncestorDepth: ontology.manifest.stats.maxAncestorDepth,
    maxDescendantDepth: ontology.manifest.stats.maxDescendantDepth,
    nodes: graph.nodes.map((term) => ontology.termJson(term, termToGenes)),
    edges: graph.edges,
  };
}

async function loadOntology(): Promise<BrowserOntology> {
  ontologyPromise ??= fetchJson<OntologyManifest>(`${DATA_BASE}/go/manifest.json`)
    .then(async (manifest) => new BrowserOntology(manifest, await fetchJsonCached<RawTerm[]>(dataUrl(manifest.files.terms), manifest.generatedAt)))
    .catch(async () => {
      const legacy = await fetchJsonCached<LegacyOntologyIndex>(`${DATA_BASE}/go-index.json`, "legacy");
      return new BrowserOntology(legacy, legacy.terms);
    });
  return ontologyPromise;
}

async function loadAnnotations(organism: string): Promise<BrowserAnnotations> {
  const key = organism || DEFAULT_ORGANISM;
  if (!annotationPromises.has(key)) {
    annotationPromises.set(
      key,
      fetchJson<AnnotationManifest>(`${DATA_BASE}/annotations/${key}/manifest.json`)
        .then((manifest) => new BrowserAnnotations(manifest))
        .catch(async () => {
          const legacy = await fetchJsonCached<LegacyAnnotationIndex>(`${DATA_BASE}/annotations/${key}.json`, "legacy");
          return legacyAnnotations(key, legacy);
        }),
    );
  }
  return annotationPromises.get(key) as Promise<BrowserAnnotations>;
}

function legacyAnnotations(key: string, legacy: LegacyAnnotationIndex): BrowserAnnotations {
  const manifest: AnnotationManifest = {
    organism: legacy.organism,
    dateGenerated: legacy.dateGenerated,
    generatedAt: "legacy",
    files: {
      genes: `annotations/${key}.legacy.genes`,
      geneSearch: `annotations/${key}.legacy.gene-search`,
      termToGenes: `annotations/${key}.legacy.term-to-genes`,
      geneToTerms: `annotations/${key}.legacy.gene-to-terms`,
      aliases: `annotations/${key}.legacy.aliases`,
    },
  };
  const annotations = new BrowserAnnotations(manifest);
  annotations.genesPromise = Promise.resolve(legacy.genes);
  annotations.geneSearchPromise = Promise.resolve(
    legacy.genes.map((gene) => ({
      ...gene,
      search: `${gene.symbol} ${gene.objectId} ${gene.db}:${gene.objectId} ${gene.name}`.toLowerCase(),
    })),
  );
  annotations.termToGenesPromise = Promise.resolve(legacy.termToGenes);
  annotations.geneToTermsPromise = Promise.resolve(legacy.geneToTerms);
  annotations.aliasesPromise = Promise.resolve(legacy.aliases);
  return annotations;
}

function stripGeneSearch(record: GeneSearchRecord): GeneRecord {
  const { search: _search, ...gene } = record;
  return gene;
}

function stripTermSearch(record: TermSearchRecord): GOTerm {
  const { search: _search, ...term } = record;
  return term;
}

function dataUrl(file: string): string {
  return `${DATA_BASE}/${file.replace(/^data\//, "")}`;
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeGene(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSearch(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function pushUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueRelations(items: RawRelation[]): RawRelation[] {
  const seen = new Set<string>();
  const result: RawRelation[] = [];
  for (const [target, type] of items) {
    const key = `${target}\0${type}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push([target, type]);
    }
  }
  return result.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
}

function deterministicSample(items: string[], limit: number): string[] {
  return [...items]
    .sort((a, b) => hashString(a) - hashString(b) || a.localeCompare(b))
    .slice(0, limit)
    .sort();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
