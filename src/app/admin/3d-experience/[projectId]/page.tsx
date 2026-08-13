"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useAdminProject } from "@/hooks/useAdminProject";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { Project3DConfigEditor } from "@/components/dashboard/Project3DConfigEditor";

/**
 * Full-page "Configure 3D Experience" editor — was a modal opened from a
 * project card in the admin console's Viewer3D tab (`admin/page.tsx`);
 * that tab's card now navigates here instead of setting local state.
 * `Project3DConfigEditor` itself is unchanged in behavior, only in shell
 * (no more `fixed inset-0` overlay — this route *is* the page).
 */
export default function Admin3DExperiencePage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const auth = useAppStore((s) => s.auth);
  const project = useAdminProject(params.projectId);
  const { t } = useT();
  // Confirmed root cause of "3D Experience upload always fails": this route
  // is reachable directly by URL, bypassing admin/page.tsx's session-repair
  // gate entirely, so a real Auth.js session gone stale here previously had
  // no repair path — every upload/delete/publish silently 401'd while the
  // page still looked "signed in as Admin" (the Zustand mock flag below).
  const { sessionStatus, authError, reauthing, establishAdminSession } = useAdminSessionRepair();

  useEffect(() => {
    // Same console-wide "signed in as Admin" gate admin/page.tsx applies —
    // this route is reachable directly by URL, bypassing that gate, so it
    // needs its own. Redirects to /admin rather than duplicating the full
    // sign-in UI/flow here.
    if (!auth.signedIn) router.replace("/admin");
  }, [auth.signedIn, router]);

  if (!auth.signedIn) return null;

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
      <Project3DConfigEditor
        project={project}
        onClose={() => router.push("/admin?tab=experience")}
      />
    </>
  );
}
