"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { MarketplaceViewer } from "./MarketplaceViewer";

/**
 * MVP admin "Preview Experience" gap-filler — see the
 * "rozaris-mvp-admin-project-pipe" memory. `getProjectBySlug` (mockData.ts)
 * only searches the static seeded `projects` array, so a project created
 * via the admin wizard (`/admin/projects/new`, Zustand `customProjects`
 * only — no server-side read path for the full `Project` shape exists yet,
 * same gap flagged in `rozaris-3d-phase3-unitmanager-inventory`) would 404
 * at the real `/project/[slug]/page.tsx` server lookup. This client-side
 * fallback (rendered only when that server lookup misses) checks Zustand
 * instead. `customProjects` persists to localStorage and is rehydrated
 * once on mount by `StoreHydration.tsx` — there can be a brief flash before
 * that finishes, e.g. opening the preview link in a fresh tab; acceptable
 * for this temporary MVP pipe, not solved here.
 */
export function CustomProjectPreview({ slug }: { slug: string }) {
  const project = useAppStore((s) => s.customProjects.find((p) => p.slug === slug));
  const { t } = useT();

  if (!project) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 text-center">
        <p className="text-sm text-neutral-500">{t("admin.projectNotFound")}</p>
      </main>
    );
  }

  return <MarketplaceViewer project={project} />;
}
