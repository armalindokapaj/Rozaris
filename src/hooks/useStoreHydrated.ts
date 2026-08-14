import { useSyncExternalStore } from "react";
import { useAppStore } from "@/lib/store";

/**
 * Real bug fix — "can't access Configure 3D Experience" (2026-08-14):
 * `useAppStore`'s persist middleware is `skipHydration: true` (see
 * `store.ts`'s own doc comment), so on every fresh client mount `auth`
 * starts at its raw default (`signedIn: false`) until `StoreHydration.tsx`'s
 * `useEffect` calls `useAppStore.persist.rehydrate()` — an async call, even
 * against localStorage. `Admin3DExperiencePage`'s own
 * `if (!auth.signedIn) router.replace("/admin")` effect ran on that same
 * first, pre-hydration render and fired the redirect before rehydration
 * corrected `auth.signedIn` back to `true` moments later — the navigation
 * had already happened, so it stuck regardless. Real users only avoided
 * this by always arriving via an in-app SPA click (store already hydrated
 * in memory); any *fresh* load of the URL (a hard refresh, a bookmark, a
 * new tab) hit it every time.
 *
 * This hook lets a redirect-on-mount effect wait for the real "hydration
 * finished" signal instead of trusting whatever `auth.signedIn` happens to
 * read on the very first render.
 */
export function useStoreHydrated() {
  return useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false
  );
}
