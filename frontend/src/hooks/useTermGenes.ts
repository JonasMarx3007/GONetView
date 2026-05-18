import { useEffect, useState } from "react";
import { fetchTermGenes } from "../api";
import type { GeneRecord } from "../types";

export function useTermGenes(detailId: string, organism: string, includeDescendants: boolean) {
  const [detailGenes, setDetailGenes] = useState<GeneRecord[]>([]);
  const [detailGeneCount, setDetailGeneCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!detailId || !organism) {
      setDetailGenes([]);
      setDetailGeneCount(0);
      return () => {
        cancelled = true;
      };
    }

    fetchTermGenes(detailId, organism, includeDescendants)
      .then((payload) => {
        if (!cancelled) {
          setDetailGenes(payload.genes);
          setDetailGeneCount(payload.geneCount);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailGenes([]);
          setDetailGeneCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailId, organism, includeDescendants]);

  return { detailGenes, detailGeneCount };
}
