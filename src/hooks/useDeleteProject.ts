"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";

/**
 * Real "delete a Project" action reachable from *inside* the full-page 3D
 * Map Control / 3D Experience editors (not just the admin grid's kebab
 * menu) — same real, audit-logged Recycle Bin route
 * (`ProjectVisibilityMenu`'s `handleDelete` in admin/page.tsx already
 * uses), so a project deleted from either surface shows up identically in
 * Super Admin's Recycle Bin, restorable from there.
 *
 * A 404 (no real Postgres row — a local-only "ghost" project, e.g. one
 * left over from before project creation became a real awaited round
 * trip) is treated as success: nothing to delete server-side, but the
 * local copy is still cleared so it stops resurrecting itself in the
 * grid — the literal "I want to be able to delete everything I create"
 * ask, including things that never made it into the real database.
 */
export function useDeleteProject() {
  const removeProject = useAppStore((s) => s.removeProject);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteProject(projectId: string, reason?: string): Promise<boolean> {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin/recycle-bin/soft-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "project", entityId: projectId, reason: reason?.trim() || undefined }),
      });
      if (res.status === 404) {
        removeProject(projectId);
        return true;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Delete failed.");
      }
      removeProject(projectId);
      return true;
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
      return false;
    } finally {
      setDeleting(false);
    }
  }

  return { deleteProject, deleting, deleteError };
}
