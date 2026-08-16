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
 *
 * Real, confirmed bug fix (live-reported: "Project not found even though
 * the project loads"): `useAdminProjects()` starts with `projects: []`
 * before its own fetch resolves, and `loaded` is exactly what
 * distinguishes "still fetching" from "fetched, genuinely empty" (see its
 * own doc comment) — this hook used to collapse both into a plain
 * `Project | null` return, so every caller's `!project` check fired
 * during that brief loading window too, on every single navigation from
 * the admin console (client-side routing mounts this hook fresh, with no
 * warm cache). Now returns `loading` alongside `project` so callers can
 * show a real loading state instead of a false "not found" — see
 * `/admin/3d-experience/[projectId]/page.tsx` and
 * `/admin/3d-map-control/[projectId]/page.tsx`.
 */
export function useAdminProject(projectId: string | undefined): { project: Project | null; loading: boolean } {
  const { projects, loaded } = useAdminProjects();
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  return { project, loading: !loaded };
}
