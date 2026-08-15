"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Plain `useState` tab switchers (Admin console, publisher/buyer
 * dashboards) all shared the same real bug: a hard refresh always reset to
 * the first/default tab instead of staying on whichever one the user was
 * looking at — nothing ever wrote the active tab anywhere the URL bar
 * could survive a reload. This mirrors it into `?tab=` (`router.replace`,
 * not `push`, so switching tabs never spams browser history) and reads it
 * back as the initial value, so a refresh, bookmark, or shared link lands
 * on the same tab.
 *
 * The calling component must be inside a `<Suspense>` boundary —
 * `useSearchParams()`'s own requirement in the Next.js App Router.
 */
export function useUrlTab<T extends string>(
  pathname: string,
  validIds: readonly T[],
  defaultId: T
): [T, (id: T) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<T>(() => {
    const fromUrl = searchParams.get("tab");
    return fromUrl && (validIds as readonly string[]).includes(fromUrl) ? (fromUrl as T) : defaultId;
  });

  function setTab(id: T) {
    setTabState(id);
    router.replace(`${pathname}?tab=${id}`, { scroll: false });
  }

  return [tab, setTab];
}
