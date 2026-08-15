import type { SavedEntityType, RecentlyViewedKind } from "./types";

/**
 * Fire-and-forget writers for the "User utility" phase's real
 * /api/account/* endpoints, called from the Zustand store's existing
 * toggle/add/remove actions right alongside their local `set()` (see
 * store.ts). Deliberately optimistic and silent on failure — the local
 * state is the source of truth for the current tab; `AccountDataSync`
 * reconciles from the server on the next sign-in/reload, same tradeoff
 * every other optimistic action in this app already makes.
 */
function post(url: string, body: unknown) {
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(
    () => {}
  );
}
function del(url: string) {
  fetch(url, { method: "DELETE" }).catch(() => {});
}

export const accountApi = {
  toggleSaved(entityType: SavedEntityType, entityId: string) {
    post("/api/account/saved", { entityType, entityId });
  },
  createSavedSearch(input: { name: string; filtersSummary: string; filters?: unknown; cadence: string }) {
    post("/api/account/saved-searches", input);
  },
  deleteSavedSearch(id: string) {
    del(`/api/account/saved-searches?id=${encodeURIComponent(id)}`);
  },
  toggleFollow(kind: "project" | "developer", targetId: string) {
    post("/api/account/follows", { kind, targetId });
  },
  trackView(kind: RecentlyViewedKind, entityId: string) {
    post("/api/account/recently-viewed", { kind, entityId });
  },
  removeRecentlyViewed(kind: RecentlyViewedKind, entityId: string) {
    del(`/api/account/recently-viewed?kind=${encodeURIComponent(kind)}&entityId=${encodeURIComponent(entityId)}`);
  },
  clearRecentlyViewed() {
    del("/api/account/recently-viewed");
  },
};
