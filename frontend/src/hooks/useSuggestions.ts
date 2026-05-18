import { useCallback, useEffect, useRef, useState } from "react";
import { searchGenes, searchTerms } from "../api";
import { activeSearchToken, type InputMode } from "../inputParsing";
import type { GeneRecord, GOTerm } from "../types";

type UseSuggestionsArgs = {
  query: string;
  inputMode: InputMode;
  organism: string;
  includeObsolete: boolean;
};

export function useSuggestions({ query, inputMode, organism, includeObsolete }: UseSuggestionsArgs) {
  const [termSuggestions, setTermSuggestions] = useState<GOTerm[]>([]);
  const [geneSuggestions, setGeneSuggestions] = useState<GeneRecord[]>([]);
  const searchTimer = useRef<number | undefined>(undefined);

  const resetSuggestions = useCallback(() => {
    setTermSuggestions([]);
    setGeneSuggestions([]);
  }, []);

  const clearSuggestions = useCallback(() => {
    window.clearTimeout(searchTimer.current);
    resetSuggestions();
  }, [resetSuggestions]);

  useEffect(() => {
    let cancelled = false;
    clearSuggestions();

    const token = activeSearchToken(query);
    if (token.length < 1) {
      return () => {
        cancelled = true;
      };
    }

    searchTimer.current = window.setTimeout(() => {
      if (inputMode === "go") {
        searchTerms(token, "", includeObsolete)
          .then((payload) => {
            if (!cancelled) {
              setTermSuggestions(payload);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setTermSuggestions([]);
            }
          });
      } else {
        searchGenes(token, organism)
          .then((payload) => {
            if (!cancelled) {
              setGeneSuggestions(payload);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setGeneSuggestions([]);
            }
          });
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(searchTimer.current);
    };
  }, [clearSuggestions, query, inputMode, organism, includeObsolete]);

  return {
    termSuggestions,
    geneSuggestions,
    clearSuggestions,
  };
}
