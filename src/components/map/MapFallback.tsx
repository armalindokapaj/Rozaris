"use client";

import { Box, List, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

/**
 * PER-009 graceful degradation: if Mapbox is unconfigured or WebGL is
 * unavailable, the discovery experience must still work via a fallback path.
 * The action is caller-supplied since "fall back to" means something
 * different on the home map (switch to List mode) vs. the ArchViz exterior
 * (open the unit list) vs. a small context map (no action needed).
 */
export function MapFallback({
  reason,
  actionLabel,
  onAction,
}: {
  reason: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useT();
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-neutral-50 to-brand-100 px-6 text-center">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(109,91,246,0.18), transparent 45%), radial-gradient(circle at 80% 70%, rgba(139,92,246,0.15), transparent 40%)",
        }}
      />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
        <Box className="h-7 w-7 text-brand-500" strokeWidth={1.5} />
      </div>
      <h2 className="relative mt-4 text-lg font-semibold text-neutral-900">
        {t("map.unavailable")}
      </h2>
      <p className="relative mt-1.5 max-w-xs text-sm text-neutral-600">{reason}</p>
      <p className="relative mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
        <TriangleAlert className="h-3.5 w-3.5" />
        {t("map.setTokenHint")}
      </p>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="relative mt-5 flex items-center gap-2 rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <List className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
