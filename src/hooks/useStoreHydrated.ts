import { useSyncExternalStore } from "react";
import { useAppStore } from "@/lib/store";

export function useStoreHydrated() {
  return useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false
  );
}
