"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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
