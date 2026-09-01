"use client";

import { useParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useAdminProject } from "@/hooks/useAdminProject";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { useDeleteProject } from "@/hooks/useDeleteProject";
import { ExperienceEditor } from "@/components/dashboard/experience-editor/ExperienceEditor";

export default function Admin3DExperiencePage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { project, loading: projectLoading } = useAdminProject(params.projectId);
  const { t } = useT();
  const { sessionStatus, authError, reauthing, establishAdminSession } = useAdminSessionRepair();
  const { deleteProject, deleting: deletingProject } = useDeleteProject();

  async function handleDeleteProject() {
    if (!project) return;
    if (!window.confirm(t("admin.projectDeleteConfirm", { name: project.name }))) return;
    const reason = window.prompt(t("admin.projectDeleteReasonPrompt"), "");
    const ok = await deleteProject(project.id, reason ?? undefined);
    if (ok) router.push("/admin?tab=experience");
  }

  if (projectLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="h-8 w-8 animate-pulse text-neutral-300" />
        <p className="text-sm text-neutral-500">{t("admin.loading")}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="h-8 w-8 text-neutral-300" />
        <p className="text-sm text-neutral-500">{t("admin.projectNotFound")}</p>
        <button
          onClick={() => router.push("/admin?tab=experience")}
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          {t("admin.backToAdminConsole")}
        </button>
      </div>
    );
  }

  return (
    <>
      {sessionStatus === "unauthenticated" && (
        <div className="fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-control border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 shadow-[var(--shadow-2)] lg:left-1/2 lg:right-auto lg:-translate-x-1/2">
          <span>{authError ?? t("admin.sessionExpiredNote")}</span>
          <button
            onClick={establishAdminSession}
            disabled={reauthing}
            className="shrink-0 rounded-control border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {reauthing ? t("admin.sessionReconnecting") : t("admin.sessionReconnect")}
          </button>
        </div>
      )}
      <ExperienceEditor
        project={project}
        onClose={() => router.push("/admin?tab=experience")}
        onDeleteProject={handleDeleteProject}
        deletingProject={deletingProject}
      />
    </>
  );
}
