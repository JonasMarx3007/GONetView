import {
  calculateEnrichment,
  createEnrichmentIndexView,
  reduceRedundancy,
  type EnrichmentCountingRequest,
  type EnrichmentIndex,
} from "./enrichment";
import type { EnrichmentWorkerPayload, EnrichmentWorkerRequest, EnrichmentWorkerResponse } from "./enrichmentWorker";

type RunArgs = EnrichmentCountingRequest & {
  indexKey: string;
  index: EnrichmentIndex;
  minTermSize: number;
  maxTermSize: number;
  reduceRedundantTerms: boolean;
  redundancyFdr: number;
  redundancyOverlap: number;
};

let worker: Worker | null = null;
let workerUnavailable = false;
let primedKey = "";
let nextRequestId = 0;

// Counting annotations over a whole organism blocks for seconds, so it runs in a worker and
// falls back to the main thread only where workers are not available, such as in tests.
export async function runEnrichmentCounting(args: RunArgs): Promise<EnrichmentWorkerPayload> {
  const instance = ensureWorker();
  if (!instance) {
    return computeLocally(args);
  }

  try {
    return await postToWorker(instance, args);
  } catch {
    workerUnavailable = true;
    primedKey = "";
    worker?.terminate();
    worker = null;
    return computeLocally(args);
  }
}

function ensureWorker(): Worker | null {
  if (workerUnavailable) {
    return null;
  }
  if (worker) {
    return worker;
  }
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./enrichmentWorker.ts", import.meta.url), { type: "module" });
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

function postToWorker(instance: Worker, args: RunArgs): Promise<EnrichmentWorkerPayload> {
  return new Promise((resolve, reject) => {
    const id = (nextRequestId += 1);
    let primeSent = primedKey !== args.indexKey;

    function handleMessage(event: MessageEvent<EnrichmentWorkerResponse>) {
      const response = event.data;
      if (response.id !== id) {
        return;
      }
      if (response.type === "needs-index") {
        // The worker restarted or holds another dataset; send the index and retry once.
        if (primeSent) {
          cleanup();
          reject(new Error("The enrichment worker could not be primed."));
          return;
        }
        primeSent = true;
        instance.postMessage(request(args, id, true));
        return;
      }
      cleanup();
      if (response.type === "error") {
        reject(new Error(response.message));
        return;
      }
      primedKey = args.indexKey;
      resolve(response.payload);
    }

    function handleError() {
      cleanup();
      reject(new Error("The enrichment worker stopped unexpectedly."));
    }

    function cleanup() {
      instance.removeEventListener("message", handleMessage);
      instance.removeEventListener("error", handleError);
    }

    instance.addEventListener("message", handleMessage);
    instance.addEventListener("error", handleError);
    instance.postMessage(request(args, id, primeSent));
  });
}

function request(args: RunArgs, id: number, withIndex: boolean): EnrichmentWorkerRequest {
  return {
    id,
    indexKey: args.indexKey,
    index: withIndex ? args.index : undefined,
    backgroundKeys: args.backgroundKeys,
    queryKeys: args.queryKeys,
    namespace: args.namespace,
    includeObsolete: args.includeObsolete,
    propagate: args.propagate,
    minTermSize: args.minTermSize,
    maxTermSize: args.maxTermSize,
    reduceRedundantTerms: args.reduceRedundantTerms,
    redundancyFdr: args.redundancyFdr,
    redundancyOverlap: args.redundancyOverlap,
  };
}

function computeLocally(args: RunArgs): EnrichmentWorkerPayload {
  const view = createEnrichmentIndexView(args.index);
  const candidates = view.buildCandidates(args);
  const calculated = calculateEnrichment(candidates, args.queryKeys.length, args.backgroundKeys.length, {
    minTermSize: args.minTermSize,
    maxTermSize: args.maxTermSize,
  });
  const reduced = args.reduceRedundantTerms
    ? reduceRedundancy({
        results: calculated.results,
        ancestorsOf: (termId) => view.termsFor(termId, true),
        fdrCutoff: args.redundancyFdr,
        overlap: args.redundancyOverlap,
      })
    : { kept: calculated.results, removed: 0 };
  return {
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
}
