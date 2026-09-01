"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SEARCH_RANKING_WEIGHTS, type SearchRankingWeights } from "@/lib/searchRanking";

export function useSearchRankingWeights(): SearchRankingWeights {
  const [weights, setWeights] = useState<SearchRankingWeights>(DEFAULT_SEARCH_RANKING_WEIGHTS);

  useEffect(() => {
    fetch("/api/search-ranking")
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => w && setWeights(w))
      .catch(() => {});
  }, []);

  return weights;
}
