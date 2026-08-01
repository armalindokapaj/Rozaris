"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";

export type CompareHintState = { x: number; y: number; text: string } | null;

const COMPARE_HINT_COPY: Record<0 | 1, string> = {
  0: "Select up to two listings or units to compare using the compare icon on any card.",
  1: "Add one more listing or unit to complete your comparison.",
};

const HINT_TIMEOUT_MS = 3000;

export function useCompareHint() {
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);

  const [hint, setHint] = useState<CompareHintState>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useClickOutside(hintRef, () => setHint(null), hint !== null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleCompareClick(e: MouseEvent<HTMLButtonElement>) {
    if (compareCount === 2) {
      setCompareOverlayOpen(true);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const x = Math.min(Math.max(e.clientX, 120), window.innerWidth - 120);
    setHint({ x, y: e.clientY, text: COMPARE_HINT_COPY[compareCount as 0 | 1] });
    timeoutRef.current = setTimeout(() => setHint(null), HINT_TIMEOUT_MS);
  }

  return { hint, hintRef, handleCompareClick };
}
