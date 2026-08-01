"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import type { CompareHintState } from "@/hooks/useCompareHint";

const HINT_TIMEOUT_MS = 3000;

/** Clicking "Saved" with nothing saved shows a small tooltip instead of navigating to an empty page. */
export function useSavedHint() {
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const { t } = useT();

  const [hint, setHint] = useState<CompareHintState>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useClickOutside(hintRef, () => setHint(null), hint !== null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleSavedClick(e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    if (savedCount > 0) return;
    e.preventDefault();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const x = Math.min(Math.max(e.clientX, 120), window.innerWidth - 120);
    setHint({ x, y: e.clientY, text: t("saved.emptyHint") });
    timeoutRef.current = setTimeout(() => setHint(null), HINT_TIMEOUT_MS);
  }

  return { hint, hintRef, handleSavedClick };
}
