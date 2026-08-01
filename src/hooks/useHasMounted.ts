import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * SSR-safe "has this component hydrated on the client yet" flag, used to
 * defer rendering of content that depends on persisted client state
 * (localStorage-backed store) until after hydration — without the extra
 * render pass a manual `useState + useEffect(() => setMounted(true))` causes.
 */
export function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
