"use client";

import { useAppStore } from "@/lib/store";
import { projects } from "@/lib/mockData";
import type { Project } from "@/lib/types";

/**
 * Resolves a `Project` by id for Admin's full-page 3D editors
 * (`/admin/3d-experience/[projectId]`, `/admin/3d-map-control/[projectId]`)
 * — the same `[...seeded mockData projects, ...Zustand customProjects]`
 * lookup `Viewer3DTab` (admin/page.tsx) already did inline before those
 * editors were modals opened from project cards there. Deliberately client
 * -side, not a server-side fetch: the public catalog (and everything
 * derived from it, including this) still reads from mockData.ts + Zustand
 * for *what's displayed*, per the "rozaris-backend-plan" memory — the real
 * Postgres `Project` row a custom project also gets (`/api/projects`) only
 * exists to anchor the 3D pipeline's own tables via a foreign key, and
 * doesn't cover the seeded mock projects at all, so it can't be used as the
 * sole source here.
 */
export function useAdminProject(projectId: string | undefined): Project | null {
  const customProjects = useAppStore((s) => s.customProjects);
  if (!projectId) return null;
  return [...projects, ...customProjects].find((p) => p.id === projectId) ?? null;
}
