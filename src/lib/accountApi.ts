import type { SavedEntityType, RecentlyViewedKind } from "./types";

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
