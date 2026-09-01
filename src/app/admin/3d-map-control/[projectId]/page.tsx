"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useAdminProject } from "@/hooks/useAdminProject";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { useDeleteProject } from "@/hooks/useDeleteProject";
import { MapModelEditor } from "@/components/dashboard/MapModelEditor";
import type { GeoPoint, Project } from "@/lib/types";

export default function Admin3DMapControlPage() {
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
    if (ok) router.push("/admin?tab=mapControl");
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
      {                                                                 
                                             }
      <MapControlWithLocation
        key={project.id}
        project={project}
        onClose={() => router.push("/admin?tab=mapControl")}
        onDeleteProject={handleDeleteProject}
        deletingProject={deletingProject}
      />
    </>
  );
}

function MapControlWithLocation({
  project,
  onClose,
  onDeleteProject,
  deletingProject,
}: {
  project: Project;
  onClose: () => void;
  onDeleteProject: () => void;
  deletingProject: boolean;
}) {
  const { t } = useT();
  const [saved, setSaved] = useState<GeoPoint>(project.coords);
  const [pin, setPin] = useState<GeoPoint>(project.coords);
  const [saving, setSaving] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = pin.lat !== saved.lat || pin.lng !== saved.lng;

  async function saveLocation() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pin.lat, lng: pin.lng }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
      }
      setSaved(pin);
      setSyncedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.mapModelSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs font-medium text-red-700">{error}</div>
      )}
      <MapModelEditor
        project={project}
        location={pin}
        onLocationChange={setPin}
        onSaveLocation={() => void saveLocation()}
        locationDirty={dirty}
        savingLocation={saving}
        reloadToken={syncedAt}
        onClose={onClose}
        onDeleteProject={onDeleteProject}
        deletingProject={deletingProject}
      />
    </>
  );
}
