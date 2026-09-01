"use client";

interface PerfStats {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  dpr: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-neutral-600">{label}</span>
      <span className="font-mono text-neutral-300">{value}</span>
    </span>
  );
}

export function StatusBar({ stats, qualityPreset, effectiveRenderScale }: { stats: PerfStats | null; qualityPreset?: string; effectiveRenderScale?: number | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-neutral-800 bg-neutral-950 px-4 py-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Stat label="FPS" value={stats ? String(stats.fps) : "—"} />
        <Stat label="Frame" value={stats ? `${stats.frameTimeMs}ms` : "—"} />
        <Stat label="Draw calls" value={stats ? String(stats.drawCalls) : "—"} />
        <Stat label="Tris" value={stats ? stats.triangles.toLocaleString() : "—"} />
        <span className="hidden xl:contents">
          <Stat label="Textures" value={stats ? String(stats.textures) : "—"} />
          <Stat label="DPR" value={stats ? stats.dpr.toFixed(2) : "—"} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-neutral-600">
          Quality Profile{" "}
          <span className="text-neutral-400">
            {qualityPreset ?? "—"}
            {effectiveRenderScale != null && ` · ${Math.round(effectiveRenderScale * 100)}% scale`}
          </span>
        </span>
        <span className="text-neutral-600">
          Warnings <span className="text-neutral-400">0</span>
        </span>
      </div>
    </div>
  );
}
