"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useAdminProject } from "@/hooks/useAdminProject";
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
          onClick={() => router.push("/admin?tab=viewer3d")}
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          {t("admin.backToAdminConsole")}
        </button>
      </div>
    );
  }

  return (
    <Project3DConfigEditor
      project={project}
      onClose={() => router.push("/admin?tab=viewer3d")}
    />
  );
}
