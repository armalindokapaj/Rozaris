"use client";

import { useAdminProjects } from "@/hooks/useAdminProjects";
import type { Project } from "@/lib/types";

/**
 * Resolves a `Project` by id for Admin's full-page 3D editors
 * (`/admin/3d-experience/[projectId]`, `/admin/3d-map-control/[projectId]`)
 * — the same lookup `Viewer3DTab` (admin/page.tsx) already did inline
 * before those editors were modals opened from project cards there.
 *
 * Real, confirmed bug fix: this used to resolve against `liveProjects`
 * (the *public* catalog — active-approval-status projects only, via
 * `useLiveProjects`/`GET /api/projects`), falling back to the Zustand-only
 * `customProjects` for anything not found there. That fallback was meant
 * to cover the brief window between an optimistic local project create and
 * its real Postgres row landing — but `customProjects` is persisted to
 * localStorage, so a project that was later soft-deleted (or whose create
 * silently failed server-side — see NewProjectModal.tsx's now-fixed
 * fire-and-forget POST) kept resolving as if real *forever*, letting
 * Admin navigate straight into a working-looking editor for a project
 * with no actual Postgres row underneath — every upload/slot-create then
 * 404'd. `useAdminProjects()` (`GET /api/admin/projects`) is the same
 * complete, always-fresh, admin-scoped list the project grid itself
 * already uses (pending/active/archived, never a deleted or phantom row),
 * so this hook now agrees with the grid instead of trusting stale local
 * state ahead of it.
 */
export function useAdminProject(projectId: string | undefined): Project | null {
  const { projects } = useAdminProjects();
  if (!projectId) return null;
  return projects.find((p) => p.id === projectId) ?? null;
}
