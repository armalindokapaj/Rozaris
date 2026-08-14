import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Real production bug fix (2026-08-14) — `sharp` is already on Next's
  // own default-externalized list, but that only protects a *direct*
  // import of `sharp` itself. Ours is transitive, several packages deep
  // (lib/glbOptimize.ts -> @gltf-transform/core -> ndarray-pixels ->
  // sharp), and node_modules has two conflicting sharp installs (a
  // hoisted 0.34.5 and ndarray-pixels' own nested 0.35.3) — Vercel's
  // runtime logs showed sharp failing to `dlopen` its native libvips
  // binary on every request that touched this import chain. Explicitly
  // externalizing the whole chain (not just sharp) means Next leaves all
  // of it as real `require()`s resolved from node_modules at runtime
  // instead of bundling/tracing them, which is the documented fix for
  // "works locally, breaks on Vercel" native-binary bundling failures —
  // see node_modules/next/dist/docs/.../serverExternalPackages.md. Kept
  // alongside (not instead of) the lazy `import()` in that route file:
  // this addresses the likely root cause, the dynamic import guarantees a
  // still-broken sharp install can never take the route down again either
  // way.
  serverExternalPackages: ["sharp", "ndarray-pixels", "@gltf-transform/core", "@gltf-transform/functions"],
};

export default nextConfig;
