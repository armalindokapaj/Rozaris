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

  // Platform Audit (2026-08-16, finding H3) — no security headers were
  // configured anywhere and no middleware.ts exists either, on an app with
  // a real admin console and file-upload surface. Scoped deliberately:
  // strict on the axes that stop real attacks at near-zero compatibility
  // cost (clickjacking via frame-ancestors, MIME-sniffing, <object>/<embed>
  // embeds, cross-origin form hijacking); permissive on script/connect/
  // img/worker-src because this app leans on mapbox-gl (its own workers +
  // tile/API hosts), WebGPU/WebGL2 (the 3D viewer), and Vercel Blob-hosted
  // photos/GLBs at URLs this file can't enumerate. Tightening script-src to
  // a nonce-based policy is real future work that needs actual browser
  // verification this pass didn't have room for — see the
  // "rozaris-publish-security-audit" memory. Camera/microphone are safe to
  // block outright (grepped: unused anywhere); geolocation is deliberately
  // left off this list since MapControls.tsx's "locate me" uses it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss: blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
