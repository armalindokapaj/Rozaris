"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";

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
