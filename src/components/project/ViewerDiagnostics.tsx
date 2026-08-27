"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { RendererFacts } from "@/lib/render-engine/RenderEngine";

/**
 * On-screen device report, shown only when the URL carries `?diag=1`.
 *
 * Why this exists: "it's dark on my iPhone, fine on desktop" is not a
 * question a desktop can answer. The two devices resolve a different
 * renderer backend (an iPhone before iOS 26 has no WebGPU at all and runs
 * three's WebGL2 backend), a different GPU with different limits, and iOS
 * silently drops GPU contexts under memory pressure — which renders a
 * permanently black viewer with nothing in any console. On top of that
 * the viewer's own Service Worker (`public/sw-3d-cache.js`) serves
 * `/_next/static/` cache-first, so a phone can be running an older build
 * against the live config API. None of those four things are visible from
 * another machine, and each of them produces exactly the same report:
 * "it's dark".
 *
 * So this prints them, on the device, in one screenshot: which backend
 * actually got used, which GPU, whether the context has been lost, and —
 * the one that no amount of remote debugging can establish — whether the
 * JavaScript running right now is the JavaScript that was last deployed.
 *
 * Read-only and inert: it renders nothing at all without the query
 * parameter, subscribes to facts the engine already reports, and never
 * touches the render path. The one action it offers is the reset that
 * this Service Worker otherwise makes genuinely hard for a visitor to
 * perform by hand.
 */
export function ViewerDiagnostics({
  facts,
  stats,
}: {
  facts: RendererFacts | null;
  stats: { fps: number; frameTimeMs: number; drawCalls: number; triangles: number; textures: number; dpr: number } | null;
}) {
  const [serverSha, setServerSha] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const clientSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

  useEffect(() => {
    fetch("/api/build-id", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setServerSha(String(d.sha)))
      .catch(() => setServerSha("unreachable"));
  }, []);

  // Read, not stored: whether a Service Worker is controlling this page is
  // a fact about the environment that is fixed for the life of the
  // document, so it needs no state — and putting it in state would mean
  // setting state from an effect for no reason. Server snapshot is
  // `false` so the markup matches before hydration.
  const swControlled = useSyncExternalStore(
    () => () => {},
    () => !!navigator.serviceWorker?.controller,
    () => false
  );

  /** The escape hatch. A visitor cannot clear a Service Worker's Cache
   * Storage from mobile Safari's UI in any discoverable way, and "load it
   * twice" is not a fix anyone should have to be told. Unregisters every
   * worker, deletes every cache this app owns, then hard-reloads. */
  async function hardReset() {
    setResetting(true);
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("rozaris-")).map((n) => caches.delete(n)));
    } catch {
      // Nothing here is load-bearing — a browser that refuses either API
      // still gets the reload below, which is the part that matters.
    }
    window.location.replace(window.location.pathname + "?diag=1&fresh=" + Date.now());
  }

  const stale = serverSha != null && serverSha !== "unreachable" && serverSha !== clientSha;
  const short = (sha: string) => (sha === "dev" || sha === "unreachable" ? sha : sha.slice(0, 7));

  return (
    <div className="pointer-events-auto fixed left-2 top-2 z-[100] max-w-[calc(100vw-1rem)] rounded-lg border border-white/15 bg-black/85 p-3 font-mono text-[11px] leading-relaxed text-white/85 backdrop-blur">
      <div className="mb-1.5 font-sans text-xs font-semibold text-white">Viewer diagnostics</div>
      <Row label="backend" value={facts ? facts.backend : "…starting"} bad={facts?.backend === "webgl2"} />
      <Row label="navigator.gpu" value={facts ? (facts.webgpuAvailable ? "present" : "absent") : "…"} bad={facts?.webgpuAvailable === false} />
      <Row label="gpu" value={facts?.glRenderer ?? (facts?.backend === "webgpu" ? "(not exposed)" : "…")} />
      <Row label="max texture" value={facts?.maxTextureSize ? `${facts.maxTextureSize}px` : "—"} />
      <Row
        label="buffer"
        value={facts?.drawingBufferPx ? `${facts.drawingBufferPx.width}×${facts.drawingBufferPx.height} @${facts.pixelRatio}x` : "—"}
      />
      <Row label="context lost" value={facts ? String(facts.contextLostCount) : "—"} bad={!!facts && facts.contextLostCount > 0} />
      <Row label="fps" value={stats ? `${stats.fps} (${stats.frameTimeMs}ms)` : "—"} bad={!!stats && stats.fps > 0 && stats.fps < 20} />
      <Row label="draws / tris" value={stats ? `${stats.drawCalls} / ${stats.triangles.toLocaleString()}` : "—"} />
      <Row label="textures" value={stats ? String(stats.textures) : "—"} />
      <div className="my-1.5 h-px bg-white/10" />
      <Row label="build (this page)" value={short(clientSha)} />
      <Row label="build (server)" value={serverSha ? short(serverSha) : "…"} bad={stale} />
      <Row label="service worker" value={swControlled ? "controlling" : "none"} />
      {stale && (
        <p className="mt-1.5 max-w-[240px] whitespace-normal font-sans text-[11px] text-amber-300">
          This device is running an older build than the server. Tap Reset.
        </p>
      )}
      <button
        type="button"
        onClick={hardReset}
        disabled={resetting}
        className="mt-2 w-full rounded border border-white/20 px-2 py-1.5 font-sans text-[11px] font-medium text-white hover:bg-white/10 disabled:opacity-50"
      >
        {resetting ? "Resetting…" : "Reset cache & reload"}
      </button>
    </div>
  );
}

function Row({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-white/45">{label}</span>
      <span className={bad ? "text-amber-300" : "text-white"}>{value}</span>
    </div>
  );
}
