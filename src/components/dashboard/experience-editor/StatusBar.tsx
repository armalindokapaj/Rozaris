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

/**
 * Bottom status bar — real live telemetry (Experience Editor v2 rebuild
 * decision: real, not stubbed, unlike the top stepper/QA badge). Only
 * shows numbers RenderEngine.ts's onPerfStats callback actually reports —
 * GPU name/VRAM/RAM estimates aren't reliably obtainable from three.js in
 * this app and are deliberately left off rather than faked. Quality
 * Profile is real now (Performance tab, PRD §40) — shows the configured
 * preset plus the REAL live effective render scale (post any adaptive/
 * interaction reduction, not just the configured target). Warnings stays
 * a true zero — no warning-producing system exists yet.
 */
export function StatusBar({ stats, qualityPreset, effectiveRenderScale }: { stats: PerfStats | null; qualityPreset?: string; effectiveRenderScale?: number | null }) {
  return (
    // Real desktop-responsive fix: `justify-between` alone doesn't shrink
    // or wrap its two groups — on any window narrow enough that both
    // groups' combined width exceeds the bar, the right group (Quality
    // Profile/Warnings) got pushed clean past the visible edge with
    // nothing to scroll or wrap it back into view. `flex-wrap` lets the
    // bar grow to a second line instead of clipping; `Textures`/`DPR` are
    // the two least load-bearing stats, so they're the first to drop
    // (via `hidden xl:flex`) rather than the whole bar reflowing before
    // it strictly needs to.
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
