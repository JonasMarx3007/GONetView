import {
  calculateEnrichment,
  createEnrichmentIndexView,
  reduceRedundancy,
  type EnrichmentIndex,
  type EnrichmentCountingRequest,
} from "./enrichment";

export type EnrichmentWorkerRequest = EnrichmentCountingRequest & {
  id: number;
  indexKey: string;
  // Sent only when the worker does not already hold this dataset.
  index?: EnrichmentIndex;
  minTermSize: number;
  maxTermSize: number;
  reduceRedundantTerms: boolean;
  redundancyFdr: number;
  redundancyOverlap: number;
};

export type EnrichmentWorkerPayload = {
  results: Array<{
    termId: string;
    observed: number;
    backgroundObserved: number;
    expected: number;
    foldEnrichment: number;
    pValue: number;
    adjustedPValue: number;
    geneKeys: string[];
  }>;
  testedTerms: number;
  testedTermsByNamespace: Record<string, number>;
  redundantTermsRemoved: number;
};

export type EnrichmentWorkerResponse =
  | { id: number; type: "result"; payload: EnrichmentWorkerPayload }
  | { id: number; type: "needs-index" }
  | { id: number; type: "error"; message: string };

let primedKey = "";
let view: ReturnType<typeof createEnrichmentIndexView> | null = null;

self.onmessage = (event: MessageEvent<EnrichmentWorkerRequest>) => {
  const request = event.data;
  if (request.index) {
    view = createEnrichmentIndexView(request.index);
    primedKey = request.indexKey;
  }

  if (!view || primedKey !== request.indexKey) {
    self.postMessage({ id: request.id, type: "needs-index" } satisfies EnrichmentWorkerResponse);
    return;
  }

  try {
    const candidates = view.buildCandidates(request);
    const calculated = calculateEnrichment(candidates, request.queryKeys.length, request.backgroundKeys.length, {
      minTermSize: request.minTermSize,
      maxTermSize: request.maxTermSize,
    });
    const reduced = request.reduceRedundantTerms
      ? reduceRedundancy({
          results: calculated.results,
          ancestorsOf: (termId) => (view as NonNullable<typeof view>).termsFor(termId, true),
          fdrCutoff: request.redundancyFdr,
          overlap: request.redundancyOverlap,
        })
      : { kept: calculated.results, removed: 0 };

    const payload: EnrichmentWorkerPayload = {
      results: reduced.kept.map((result) => ({
        termId: result.term.id,
        observed: result.observed,
        backgroundObserved: result.backgroundObserved,
        expected: result.expected,
        foldEnrichment: result.foldEnrichment,
        pValue: result.pValue,
        adjustedPValue: result.adjustedPValue,
        geneKeys: result.genes,
      })),
      testedTerms: calculated.testedTerms,
      testedTermsByNamespace: calculated.testedTermsByNamespace,
      redundantTermsRemoved: reduced.removed,
    };
    self.postMessage({ id: request.id, type: "result", payload } satisfies EnrichmentWorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : "Enrichment failed in the worker.",
    } satisfies EnrichmentWorkerResponse);
  }
};
