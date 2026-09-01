"use client";

import { useAdminProjects } from "@/hooks/useAdminProjects";
import type { Project } from "@/lib/types";

export function useAdminProject(projectId: string | undefined): { project: Project | null; loading: boolean } {
  const { projects, loaded } = useAdminProjects();
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  return { project, loading: !loaded };
}
