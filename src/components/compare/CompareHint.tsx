"use client";

import type { RefObject } from "react";
import type { CompareHintState } from "@/hooks/useCompareHint";

export function CompareHint({
  hint,
  hintRef,
}: {
  hint: CompareHintState;
  hintRef: RefObject<HTMLDivElement | null>;
}) {
  if (!hint) return null;

  return (
    <div
      ref={hintRef}
      role="status"
      className="pointer-events-none fixed z-50 max-w-[220px] -translate-x-1/2 rounded-control bg-neutral-900 px-3 py-2 text-xs font-medium leading-snug text-white shadow-[var(--shadow-1)]"
      style={{ left: hint.x, top: hint.y + 16 }}
    >
      {hint.text}
    </div>
  );
}
