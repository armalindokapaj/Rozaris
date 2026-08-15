"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SEARCH_RANKING_WEIGHTS, type SearchRankingWeights } from "@/lib/searchRanking";

/** Client-side read of the real, admin-adjustable ranking weights
 * (`GET /api/search-ranking`) — starts at the same defaults the server
 * falls back to, so results don't visibly re-sort once the fetch
 * resolves in the common case (admin hasn't touched the weights yet). */
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
