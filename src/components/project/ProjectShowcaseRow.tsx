"use client";

import Link from "next/link";
import { Box, Building2, Heart, Waves, Home as HomeIcon } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Project, ProjectSetting } from "@/lib/types";

const SETTING_ICON: Record<ProjectSetting, typeof Building2> = {
  tower: Building2,
  beach: Waves,
  residential_complex: HomeIcon,
};

const SETTING_LABEL_KEY: Record<ProjectSetting, string> = {
  tower: "newProjectsPage.settingTower",
  beach: "newProjectsPage.settingBeach",
  residential_complex: "newProjectsPage.settingResidentialComplex",
};

const STATUS_LABEL_KEY: Record<Project["status"], string> = {
  coming_soon: "results.statusComingSoon",
  under_construction: "results.statusUnderConstruction",
  completed: "results.statusCompleted",
};

/** Full-bleed-image project card for the Developer profile page — a
 * different (stacked, larger) treatment than ProjectListRow's side-by-side
 * row, matching that page's own reference design. Same underlying facts,
 * different layout; not meant to replace ProjectListRow elsewhere. */
export function ProjectShowcaseRow({ project }: { project: Project }) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const construction = useProjectConstruction(project);
  const auth = useAppStore((s) => s.auth);
  const saved = useAppStore((s) => s.saved.projects.includes(project.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedProject);
  const SettingIcon = SETTING_ICON[project.setting];
  const fromPrice = project.units.length
    ? Math.min(...project.units.map((u) => u.price))
    : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-panel border transition-colors",
        project.premium
          ? "border-listing-premium/50 bg-amber-50/70 hover:border-listing-premium hover:shadow-[var(--shadow-1)]"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-[var(--shadow-1)]"
      )}
    >
      <div className="relative aspect-[21/9] w-full">
        <PlaceholderImage seed={project.slug} kind="hero" className="h-full w-full" watermark />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-listing-new-dev px-2.5 py-1 text-[11px] font-semibold text-white shadow">
            {t("results.newProject")}
          </span>
          {project.premium && (
            <span className="rounded-full bg-listing-premium px-2.5 py-1 text-[11px] font-semibold text-white shadow">
              {t("results.premium")}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-serif text-xl text-neutral-900">{project.name}</p>
            <button
              onClick={() => auth.signedIn && toggleSaved(project.id)}
              disabled={!auth.signedIn}
              aria-label={saved ? t("results.removeFromSaved") : t("results.saveProject")}
              aria-pressed={saved}
              className="shrink-0 text-neutral-400 hover:text-red-500 disabled:opacity-40 sm:hidden"
            >
              <Heart className={cn("h-5 w-5", saved && "fill-red-500 text-red-500")} />
            </button>
          </div>
          <p className="text-sm text-neutral-500">
            {project.developer.name} · {project.city}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <SettingIcon className="h-3.5 w-3.5" />
              {t(SETTING_LABEL_KEY[project.setting])}
            </span>
            {fromPrice != null && (
              <span className="font-semibold text-neutral-800">
                {t("newProjectsPage.fromPrice", { price: priceFmt(fromPrice, { compact: true }) })}
              </span>
            )}
            <span>{t("results.unitsLeft", { count: project.availableUnits })}</span>
            <span>{project.completionLabel}</span>
            {project.amenities.length > 0 && (
              <span>{t("newProjectsPage.amenitiesCount", { count: project.amenities.length })}</span>
            )}
          </div>

          {project.status === "under_construction" && (
            <div className="mt-3 max-w-xs">
              <div className="flex items-center justify-between text-[11px] text-neutral-400">
                <span>{t("project.constructionProgress")}</span>
                <span className="font-semibold text-neutral-600">{construction.progressPercent}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-listing-new-dev"
                  style={{ width: `${construction.progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <span className="mt-2.5 inline-block rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {t(STATUS_LABEL_KEY[project.status])}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end">
          <button
            onClick={() => auth.signedIn && toggleSaved(project.id)}
            disabled={!auth.signedIn}
            aria-label={saved ? t("results.removeFromSaved") : t("results.saveProject")}
            aria-pressed={saved}
            className="hidden text-neutral-400 hover:text-red-500 disabled:opacity-40 sm:block"
          >
            <Heart className={cn("h-4.5 w-4.5", saved && "fill-red-500 text-red-500")} />
          </button>
          <div className="flex items-center gap-3">
            <Link
              href={`/project/${project.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              <Box className="h-3.5 w-3.5" />
              {t("results.exploreIn3d")}
            </Link>
            <Link
              href={`/projects/${project.slug}`}
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
            >
              {t("results.viewDetails")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
