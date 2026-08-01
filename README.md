# ROZARIS — 3D Property Discovery Platform

A frontend implementation of the ROZARIS product MVP: a 3D-first real-estate
discovery experience for Tirana, Albania, built against the product
requirements in `3D website.pdf`. Fully responsive, mobile-first.

This is a **frontend prototype** wired to realistic mock data — there is no
backend, authentication, payments, or moderation queue behind it (see
[Scope](#scope-and-honest-limitations) below). It's built to the point where
swapping mock data for real API calls is a contained, mechanical change.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Enabling the live 3D map

The app runs fully without one, gracefully falling back to a list-first
experience (`MapFallback`) per the PRD's degradation requirements
(PER-009). To see the real interactive Mapbox 3D map:

1. Get a public token at https://account.mapbox.com/access-tokens/
2. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_MAPBOX_TOKEN`
3. Restart the dev server

## Stack

- **Next.js 16** (App Router, TypeScript, React 19)
- **Tailwind CSS v4** — design tokens (colors, radii, spacing) defined in
  `src/app/globals.css` under `@theme`, matching PRD Section 24
- **Mapbox GL JS v3** (`mapbox://styles/mapbox/standard`) for the 3D city map
- **Zustand** for global state (filters, compare, saved, map viewport,
  layout mode), persisted to `localStorage` where appropriate
- No backend — `src/lib/mockData.ts` is a deterministic, seeded mock dataset
  (Tirana neighborhoods, listings, developer projects and units)

## What's implemented

- **Map/List/Compare discovery** (`/`) — persistent 3D Mapbox instance
  shared across layout mode changes (PER-007), neighborhood-level
  aggregation at low zoom, individual listing/project markers at closer
  zoom, project popups (BR-014: developer name, unit count, Explore in 3D),
  building-aggregate popups (MAP-016), full filter set, sort, saved
  searches, two-item compare with replace-prompt (CMP-001)
- **Responsive layout** — desktop Map Mode (20/60/20) and List Mode
  (20/20/60) per Section 5.2–5.3; mobile full-width map with draggable
  bottom sheets for listings/filters (Section 5.5)
- **Listing detail** (`/listing/[slug]`) — gallery with photo/floor-plan/
  facade tabs, mortgage calculator, publisher contact card, structured data
- **Dedicated ArchViz viewer** (`/project/[slug]`) — opens in a new tab,
  exterior-first entry, unit discovery with filters, unit detail panel,
  construction-timeline scrubber, simplified/non-3D fallback mode
  (see [ArchViz note](#archviz-viewer-implementation-note) below)
- **Developer pages** (`/developer/[slug]`, `/developers`)
- **Publisher dashboard** (`/dashboard`) and **Admin console** (`/admin`) —
  representative stubs (overview stats, listing/project tables, approval
  queue) demonstrating the intended workflows, not a full moderation engine
- **Saved items**, **mortgage calculator page**, **help center**
- Accessibility: skip link, semantic landmarks, keyboard-operable controls,
  `prefers-reduced-motion` handling, WCAG AA color contrast on brand actions

## ArchViz viewer implementation note

Section 10 of the PRD specifies a full 3D asset intake pipeline (Revit/IFC/
FBX/GLB uploads, Admin-optimized low-poly + ArchViz model pairs). That
pipeline is out of scope for a frontend-only prototype — there are no real
developer-supplied 3D models. The ArchViz exterior view instead renders the
project's real coordinates using Mapbox's 3D building extrusion as an
honest, functioning stand-in (`ExteriorViewer.tsx`), clearly documented at
the component boundary so it can be swapped for a bespoke three.js/Babylon
GLB viewer without touching the surrounding unit-discovery UI.

## Scope and honest limitations

Explicitly **not** implemented (would require a real backend):
phone-OTP auth, payments/premium billing, the Admin approval workflow
actually gating publish state, the 3D asset pipeline, real-time
availability sync, and analytics event collection. Sign-in throughout the
app is a mock toggle (`useAppStore().signIn(...)`) for demoing gated UI
states (saved items, compare persistence, dashboard/admin access).

## Project structure

```
src/
  app/
    layout.tsx              root layout: fonts, global overlays
    (site)/                 pages sharing the public Header
      page.tsx               home (map/list/compare)
      listing/[slug]/
      developer/[slug]/, developers/
      dashboard/, admin/, saved/, help/
      resources/mortgage-calculator/
    project/[slug]/          ArchViz viewer (own minimal chrome, no site header)
  components/
    map/                    MapView, markers, popups, fallback
    project/                ExteriorViewer, unit discovery/detail
    search/ results/ compare/ listing/ home/ layout/ common/
  lib/
    types.ts                domain types
    mockData.ts              seeded mock dataset
    store.ts                zustand store
    filtering.ts             filter/sort logic
```
