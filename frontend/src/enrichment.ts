import type { EnrichmentResult } from "./types";

// Terms and genes stay generic so the same code runs on full records in the app and on bare
// identifiers inside the worker, where cloning whole records would be wasteful.
export type EnrichmentTerm = {
  id: string;
  namespace: string;
};

export type EnrichmentCandidate<TTerm extends EnrichmentTerm = EnrichmentTerm, TGene = unknown> = {
  term: TTerm;
  observed: number;
  backgroundObserved: number;
  genes: TGene[];
};

export type EnrichmentOutcome<TTerm extends EnrichmentTerm, TGene> = {
  term: TTerm;
  observed: number;
  querySize: number;
  backgroundObserved: number;
  backgroundSize: number;
  expected: number;
  foldEnrichment: number;
  pValue: number;
  adjustedPValue: number;
  genes: TGene[];
};

// The slice of the ontology and annotations the counting step needs, in a shape that is cheap
// to hand to a worker.
export type EnrichmentIndex = {
  // is_a and part_of targets per term, used to propagate annotations to ancestors.
  parents: Record<string, string[]>;
  namespaces: Record<string, string>;
  obsolete: string[];
  geneToTerms: Record<string, string[]>;
};

export type EnrichmentCountingRequest = {
  backgroundKeys: string[];
  queryKeys: string[];
  namespace: string;
  includeObsolete: boolean;
  propagate: boolean;
};

export type EnrichmentOptions = {
  // Terms annotated to very few or very many background genes carry little information and
  // cost multiple-testing power, so callers usually restrict the tested set.
  minTermSize?: number;
  // A cap of zero or less means no upper bound.
  maxTermSize?: number;
};

export function calculateEnrichment<TTerm extends EnrichmentTerm, TGene>(
  candidates: Array<EnrichmentCandidate<TTerm, TGene>>,
  querySize: number,
  backgroundSize: number,
  options: EnrichmentOptions = {},
): {
  results: Array<EnrichmentOutcome<TTerm, TGene>>;
  testedTerms: number;
  testedTermsByNamespace: Record<string, number>;
} {
  if (querySize <= 0 || backgroundSize <= 0 || querySize > backgroundSize) {
    return { results: [], testedTerms: 0, testedTermsByNamespace: {} };
  }

  const minTermSize = Math.max(1, Math.floor(options.minTermSize ?? 1));
  const cap = Math.floor(options.maxTermSize ?? 0);
  const maxTermSize = cap > 0 ? Math.min(cap, backgroundSize) : backgroundSize;

  const eligible = candidates.filter(
    ({ backgroundObserved }) => backgroundObserved >= minTermSize && backgroundObserved <= maxTermSize,
  );
  const withPValues = eligible.map((candidate) => ({
    candidate,
    pValue: hypergeometricSurvival(
      candidate.observed,
      querySize,
      candidate.backgroundObserved,
      backgroundSize,
    ),
  }));

  // GO namespaces are separate ontologies, so each one is corrected on its own family of tests.
  const adjusted = new Array<number>(withPValues.length).fill(1);
  const testedTermsByNamespace: Record<string, number> = {};
  const byNamespace = new Map<string, number[]>();
  for (const [index, { candidate }] of withPValues.entries()) {
    const namespace = candidate.term.namespace;
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), index]);
  }
  for (const [namespace, indexes] of byNamespace) {
    testedTermsByNamespace[namespace] = indexes.length;
    const namespaceAdjusted = benjaminiHochberg(indexes.map((index) => withPValues[index].pValue));
    for (const [position, index] of indexes.entries()) {
      adjusted[index] = namespaceAdjusted[position];
    }
  }

  const results = withPValues
    .map(({ candidate, pValue }, index): EnrichmentOutcome<TTerm, TGene> => {
      const expected = (querySize * candidate.backgroundObserved) / backgroundSize;
      return {
        term: candidate.term,
        observed: candidate.observed,
        querySize,
        backgroundObserved: candidate.backgroundObserved,
        backgroundSize,
        expected,
        foldEnrichment: expected > 0 ? candidate.observed / expected : 0,
        pValue,
        adjustedPValue: adjusted[index],
        genes: candidate.genes,
      };
    })
    .filter(({ observed }) => observed > 0)
    .sort(
      (a, b) =>
        a.adjustedPValue - b.adjustedPValue ||
        a.pValue - b.pValue ||
        b.foldEnrichment - a.foldEnrichment ||
        a.term.id.localeCompare(b.term.id),
    );

  return { results, testedTerms: eligible.length, testedTermsByNamespace };
}

// Walking ancestors dominates the counting step, so the closure per term is cached for the
// lifetime of the view. A worker keeps one view alive across runs of the same dataset.
export function createEnrichmentIndexView(index: EnrichmentIndex) {
  const ancestorCache = new Map<string, string[]>();
  const obsolete = new Set(index.obsolete);

  function termsFor(termId: string, propagate: boolean): string[] {
    if (!propagate) {
      return index.namespaces[termId] === undefined ? [] : [termId];
    }
    const cached = ancestorCache.get(termId);
    if (cached) {
      return cached;
    }

    const terms = new Set<string>();
    const queue = [termId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      if (terms.has(current) || index.namespaces[current] === undefined) {
        continue;
      }
      terms.add(current);
      for (const parent of index.parents[current] ?? []) {
        queue.push(parent);
      }
    }
    const result = [...terms];
    ancestorCache.set(termId, result);
    return result;
  }

  function buildCandidates(request: EnrichmentCountingRequest): Array<EnrichmentCandidate<EnrichmentTerm, string>> {
    const { backgroundKeys, queryKeys, namespace, includeObsolete, propagate } = request;
    const querySet = new Set(queryKeys);
    const backgroundCounts = new Map<string, number>();
    const queryCounts = new Map<string, number>();
    const queryHits = new Map<string, string[]>();

    for (const geneKey of backgroundKeys) {
      const inQuery = querySet.has(geneKey);
      const termsForGene = new Set<string>();
      for (const directTerm of index.geneToTerms[geneKey] ?? []) {
        for (const termId of termsFor(directTerm, propagate)) {
          termsForGene.add(termId);
        }
      }
      for (const termId of termsForGene) {
        backgroundCounts.set(termId, (backgroundCounts.get(termId) ?? 0) + 1);
        if (inQuery) {
          queryCounts.set(termId, (queryCounts.get(termId) ?? 0) + 1);
          queryHits.set(termId, [...(queryHits.get(termId) ?? []), geneKey]);
        }
      }
    }

    const candidates: Array<EnrichmentCandidate<EnrichmentTerm, string>> = [];
    for (const [termId, backgroundObserved] of backgroundCounts) {
      const termNamespace = index.namespaces[termId];
      if (termNamespace === undefined || (!includeObsolete && obsolete.has(termId)) || (namespace && termNamespace !== namespace)) {
        continue;
      }
      candidates.push({
        term: { id: termId, namespace: termNamespace },
        observed: queryCounts.get(termId) ?? 0,
        backgroundObserved,
        genes: queryHits.get(termId) ?? [],
      });
    }
    return candidates;
  }

  return { buildCandidates, termsFor };
}

// Genes are compared as identifiers, so this runs where they are still keys: in the worker.
export type RedundancyInput<TTerm extends EnrichmentTerm> = {
  results: Array<EnrichmentOutcome<TTerm, string>>;
  // is_a / part_of ancestors per term, used to spot parent-child pairs.
  ancestorsOf: (termId: string) => string[];
  fdrCutoff: number;
  // Share of a parent's hit genes that a kept descendant must already cover.
  overlap: number;
};

// The common, cheap redundancy filter: when a significant parent term contributes essentially
// the same genes as a significant descendant, the parent adds no information and is dropped.
// Terms are visited best-first, so the most significant member of a chain is the one kept.
export function reduceRedundancy<TTerm extends EnrichmentTerm>({
  results,
  ancestorsOf,
  fdrCutoff,
  overlap,
}: RedundancyInput<TTerm>): { kept: Array<EnrichmentOutcome<TTerm, string>>; removed: number } {
  const significant = results.filter((result) => result.adjustedPValue <= fdrCutoff);
  const keptGenesByTerm = new Map<string, Set<string>>();
  const dropped = new Set<string>();

  for (const result of significant) {
    const genes = new Set(result.genes);
    const isCovered = [...keptGenesByTerm].some(([keptId, keptGenes]) => {
      // Only compare against descendants already kept, never across unrelated branches.
      if (!ancestorsOf(keptId).includes(result.term.id)) {
        return false;
      }
      if (genes.size === 0) {
        return true;
      }
      let shared = 0;
      for (const gene of genes) {
        if (keptGenes.has(gene)) {
          shared += 1;
        }
      }
      return shared / genes.size >= overlap;
    });

    if (isCovered) {
      dropped.add(result.term.id);
      continue;
    }
    keptGenesByTerm.set(result.term.id, genes);
  }

  return { kept: results.filter((result) => !dropped.has(result.term.id)), removed: dropped.size };
}

export function hypergeometricSurvival(
  observed: number,
  querySize: number,
  backgroundObserved: number,
  backgroundSize: number,
): number {
  const N = Math.floor(backgroundSize);
  const K = Math.floor(backgroundObserved);
  const n = Math.floor(querySize);
  const k = Math.floor(observed);
  if (N <= 0 || K < 0 || n < 0 || K > N || n > N) {
    return Number.NaN;
  }

  const minimum = Math.max(0, n - (N - K));
  const maximum = Math.min(n, K);
  if (k <= minimum) {
    return 1;
  }
  if (k > maximum) {
    return 0;
  }

  let logTerm = logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n);
  let logSum = logTerm;
  for (let x = k; x < maximum; x += 1) {
    const numeratorA = K - x;
    const numeratorB = n - x;
    const denominatorA = x + 1;
    const denominatorB = N - K - n + x + 1;
    if (numeratorA <= 0 || numeratorB <= 0 || denominatorB <= 0) {
      break;
    }
    logTerm += Math.log(numeratorA) + Math.log(numeratorB) - Math.log(denominatorA) - Math.log(denominatorB);
    logSum = logAdd(logSum, logTerm);
  }
  return Math.min(1, Math.max(0, Math.exp(logSum)));
}

export function benjaminiHochberg(pValues: number[]): number[] {
  const adjusted = new Array<number>(pValues.length).fill(1);
  const ordered = pValues
    .map((pValue, index) => ({ pValue: Math.min(1, Math.max(0, pValue)), index }))
    .sort((a, b) => a.pValue - b.pValue || a.index - b.index);
  let runningMinimum = 1;
  for (let rankIndex = ordered.length - 1; rankIndex >= 0; rankIndex -= 1) {
    const entry = ordered[rankIndex];
    const rank = rankIndex + 1;
    runningMinimum = Math.min(runningMinimum, (entry.pValue * ordered.length) / rank);
    adjusted[entry.index] = Math.min(1, runningMinimum);
  }
  return adjusted;
}

export function enrichmentCsv(results: EnrichmentResult[]): string {
  const header = [
    "go_id",
    "term_name",
    "namespace",
    "query_hits",
    "query_size",
    "background_hits",
    "background_size",
    "expected_hits",
    "fold_enrichment",
    "p_value",
    "adjusted_p_value",
    "genes",
  ];
  const rows = results.map((result) => [
    result.term.id,
    result.term.name,
    result.term.namespace,
    String(result.observed),
    String(result.querySize),
    String(result.backgroundObserved),
    String(result.backgroundSize),
    result.expected.toPrecision(8),
    result.foldEnrichment.toPrecision(8),
    result.pValue.toPrecision(8),
    result.adjustedPValue.toPrecision(8),
    result.genes.map((gene) => gene.symbol).join(";"),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) {
    return Number.NEGATIVE_INFINITY;
  }
  const smaller = Math.min(k, n - k);
  let value = 0;
  for (let index = 1; index <= smaller; index += 1) {
    value += Math.log(n - smaller + index) - Math.log(index);
  }
  return value;
}

function logAdd(a: number, b: number): number {
  const maximum = Math.max(a, b);
  if (!Number.isFinite(maximum)) {
    return maximum;
  }
  return maximum + Math.log(Math.exp(a - maximum) + Math.exp(b - maximum));
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
