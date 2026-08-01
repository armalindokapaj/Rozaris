"use client";

import Link from "next/link";
import { Box, Building2, Waves, Home as HomeIcon } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
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

/** Richer horizontal row for the New Projects "List view" — more facts
 * visible per project than the compact grid ProjectCard, for browsing
 * before committing to a detail/3D view. */
export function ProjectListRow({ project }: { project: Project }) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const SettingIcon = SETTING_ICON[project.setting];
  const fromPrice = project.units.length
    ? Math.min(...project.units.map((u) => u.price))
    : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-panel border p-4 transition-all sm:flex-row",
        project.premium
          ? "border-listing-premium/50 bg-amber-50/70 hover:z-10 hover:scale-[1.015] hover:border-listing-premium hover:shadow-lg"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
      )}
    >
      <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-card sm:h-auto sm:w-52">
        <PlaceholderImage seed={project.slug} kind="hero" className="h-full w-full" />
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-full bg-listing-new-dev px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            {t("results.newProject")}
          </span>
          {project.premium && (
            <span className="rounded-full bg-listing-premium px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              {t("results.premium")}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-neutral-900">{project.name}</p>
              <p className="truncate text-sm text-neutral-500">
                {project.developer.name} · {project.city}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {t(STATUS_LABEL_KEY[project.status])}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-500">
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
            <div className="mt-2.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-listing-new-dev"
                style={{ width: `${project.progressPercent}%` }}
              />
            </div>
          )}
        </div>

        <Link
          href={`/project/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 sm:w-fit sm:px-5"
        >
          <Box className="h-3.5 w-3.5" />
          {t("results.exploreIn3d")}
        </Link>
      </div>
    </div>
  );
}
