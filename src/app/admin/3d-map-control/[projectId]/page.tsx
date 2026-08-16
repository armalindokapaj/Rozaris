"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useAdminProject } from "@/hooks/useAdminProject";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { useStoreHydrated } from "@/hooks/useStoreHydrated";
import { useDeleteProject } from "@/hooks/useDeleteProject";
import { MapModelEditor } from "@/components/dashboard/MapModelEditor";

/**
 * Full-page "Configure 3D Map Control" editor — was a modal opened from a
 * project card in the admin console's Viewer3D tab (`admin/page.tsx`);
 * that tab's card now navigates here instead of setting local state.
 * `MapModelEditor` itself is unchanged in behavior, only in shell (no more
 * `fixed inset-0` overlay — this route *is* the page). See the identical
 * pattern/comments in `../../3d-experience/[projectId]/page.tsx`, including
 * the session-repair banner below (same confirmed root cause of uploads
 * silently 401'ing on this route too).
 */
export default function Admin3DMapControlPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const auth = useAppStore((s) => s.auth);
  const { project, loading: projectLoading } = useAdminProject(params.projectId);
  const { t } = useT();
  const { sessionStatus, authError, reauthing, establishAdminSession } = useAdminSessionRepair();
  const { deleteProject, deleting: deletingProject } = useDeleteProject();

  async function handleDeleteProject() {
    if (!project) return;
    if (!window.confirm(t("admin.projectDeleteConfirm", { name: project.name }))) return;
    const reason = window.prompt(t("admin.projectDeleteReasonPrompt"), "");
    const ok = await deleteProject(project.id, reason ?? undefined);
    if (ok) router.push("/admin?tab=mapControl");
  }
  // Same real bug fix as ../../3d-experience/[projectId]/page.tsx — see
  // useStoreHydrated's own doc comment for the full "fresh load bounces
  // back to /admin" root cause.
  const hydrated = useStoreHydrated();

  useEffect(() => {
    if (!hydrated) return;
    if (!auth.signedIn) router.replace("/admin");
  }, [hydrated, auth.signedIn, router]);

  if (!hydrated) return null;
  if (!auth.signedIn) return null;

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
          onClick={() => router.push("/admin?tab=mapControl")}
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
      <MapModelEditor
        key={project.id}
        project={project}
        onClose={() => router.push("/admin?tab=mapControl")}
        onDeleteProject={handleDeleteProject}
        deletingProject={deletingProject}
      />
    </>
  );
}
