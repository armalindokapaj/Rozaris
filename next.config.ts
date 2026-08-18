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
      // Multi-Channel Publishing PRD Phase 5 — `/embed/[publicKey]` is
      // meant to be iframed into a THIRD PARTY's own page; the blanket
      // `frame-ancestors 'none'`/`X-Frame-Options: DENY` above would
      // block that outright, which defeats the entire route's purpose.
      // Per this exact Next.js version's own bundled docs
      // (node_modules/next/dist/docs/.../headers.md: "If two headers
      // match the same path and set the same header key, the last
      // header key will override the first"), this later, more specific
      // `source` correctly overrides the blanket rule above for this one
      // path — confirmed against the framework's own documented
      // behavior, not assumed.
      //
      // `frame-ancestors *` here is a deliberate choice, not a
      // shortcut: this route can't do genuine per-target
      // `allowedOrigins`-based CSP locking statically (that needs a DB
      // lookup keyed by `publicKey`, which `headers()` can't do — it's
      // evaluated without per-request access). The real access boundary
      // is already `publicKey` itself (`resolveTarget.ts`'s own doc
      // comment: "a publicKey IS the access control here") — framing
      // this page from an arbitrary origin gets an attacker nothing they
      // couldn't already get by opening the URL directly. The one place
      // `allowedOrigins` actually IS enforced (real, already
      // curl-verified) is server-side in `resolvePublishTarget()`
      // against every `fetch()` call `useEmbedBootstrap` makes to
      // `/api/viewer/v1/t/[publicKey]/*` — browsers reliably send a real
      // `Origin` header on those (fetch/XHR), unlike a bare top-level
      // iframe navigation, which doesn't always carry one. Genuine
      // dynamic per-target frame-ancestors (via middleware + a DB/cache
      // lookup) is real future work, flagged rather than half-built
      // blind.
      {
        source: "/embed/:publicKey*",
        headers: [
          // The blanket rule above sets X-Frame-Options: DENY for
          // "/:path*" — that match still applies here too (Next.js
          // merges same-key headers by "last one wins," it doesn't let a
          // more specific rule silently omit/unset a key the broader
          // rule already set), so this has to be an explicit override,
          // not a gap left for CSP frame-ancestors to quietly win by
          // default. X-Frame-Options has no "allow" value (only DENY/
          // SAMEORIGIN/the deprecated, unsupported-in-modern-browsers
          // ALLOW-FROM) — every modern browser already prioritizes CSP
          // frame-ancestors over X-Frame-Options when both are present
          // (CSP living standard), and any browser old enough to NOT
          // understand frame-ancestors also, in practice, treats an
          // unrecognized X-Frame-Options value as "ignore this header"
          // rather than "deny" — so an explicit non-standard value here
          // is strictly safer than leaving DENY in place for a route
          // whose entire purpose is being framed by someone else.
          { key: "X-Frame-Options", value: "ALLOWALL" },
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
              "frame-ancestors *",
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
