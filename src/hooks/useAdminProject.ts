"use client";

import { useAppStore } from "@/lib/store";
import { useLiveProjects } from "@/hooks/useLiveProjects";
import type { Project } from "@/lib/types";

/**
 * Resolves a `Project` by id for Admin's full-page 3D editors
 * (`/admin/3d-experience/[projectId]`, `/admin/3d-map-control/[projectId]`)
 * — the same lookup `Viewer3DTab` (admin/page.tsx) already did inline
 * before those editors were modals opened from project cards there.
 *
 * Real Postgres now (see the "Rozaris Platform Audit" memory's
 * Projects/Units migration) — `prisma/seed.ts` seeds every mockData
 * project into the same table `POST /api/projects` writes to, so
 * `liveProjects` alone covers both. `customProjects` (Zustand-only) stays
 * as the fallback for a project created this session before its own
 * `GET /api/projects` refetch has caught up — same reasoning
 * `CustomProjectPreview.tsx` documents.
 */
export function useAdminProject(projectId: string | undefined): Project | null {
  const customProjects = useAppStore((s) => s.customProjects);
  const liveProjects = useAppStore((s) => s.liveProjects);
  useLiveProjects();
  if (!projectId) return null;
  return [...(liveProjects ?? []), ...customProjects].find((p) => p.id === projectId) ?? null;
}
