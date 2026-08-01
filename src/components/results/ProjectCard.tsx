"use client";

import { Box } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { getNeighborhood } from "@/lib/mockData";
import type { Project } from "@/lib/types";

const STATUS_LABEL_KEY: Record<Project["status"], string> = {
  coming_soon: "results.statusComingSoon",
  under_construction: "results.statusUnderConstruction",
  completed: "results.statusCompleted",
};

export function ProjectCard({ project }: { project: Project }) {
  const neighborhood = getNeighborhood(project.neighborhoodId);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const setHovered = useAppStore((s) => s.setHovered);
  const selectProject = useAppStore((s) => s.selectProject);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);
  const { t } = useT();
  const construction = useProjectConstruction(project);

  const isActive = selectedProjectId === project.id || hoveredId === project.id;

  return (
    <div
      onMouseEnter={() => setHovered(project.id)}
      onMouseLeave={() => setHovered(null)}
      onClick={() => {
        selectProject(project.id);
        requestFlyTo({ lat: project.coords.lat, lng: project.coords.lng, zoom: 16.5 });
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "block cursor-pointer overflow-hidden rounded-card border shadow-sm transition-all",
        project.premium ? "bg-amber-50/70" : "bg-white",
        isActive
          ? "border-listing-new-dev shadow-lg ring-1 ring-brand-200"
          : project.premium
          ? "border-listing-premium/50"
          : "border-neutral-200 hover:border-neutral-300 hover:shadow-md",
        // Applied whenever premium, not only in the non-active branch above —
        // otherwise hovering the card sets hoveredId (for map-marker sync),
        // which flips isActive and would silently swallow the zoom effect.
        project.premium && "hover:z-10 hover:scale-[1.02] hover:border-listing-premium hover:shadow-lg"
      )}
    >
      <div className="relative aspect-[4/3] w-full">
        <PlaceholderImage seed={project.slug} kind="hero" className="h-full w-full" />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          <span className="rounded-full bg-listing-new-dev px-2 py-1 text-[11px] font-semibold text-white shadow">
            {t("results.newProject")}
          </span>
          {/* No "Premium" text badge — premium status reads through the
              amber tint/border and hover treatment only. */}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-3.5">
        <p className="truncate text-sm font-semibold text-neutral-900">{project.name}</p>
        <p className="truncate text-xs text-neutral-500">
          {project.developer.name} · {neighborhood?.name ?? project.city}
        </p>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-500">
          <span>{t(STATUS_LABEL_KEY[project.status])}</span>
          <span className="font-semibold text-neutral-800">
            {t("results.unitsLeft", { count: project.availableUnits })}
          </span>
        </div>
        {project.status === "under_construction" && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-listing-new-dev"
              style={{ width: `${construction.progressPercent}%` }}
            />
          </div>
        )}
        <a
          href={`/project/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 flex items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          <Box className="h-3.5 w-3.5" />
          {t("results.exploreIn3d")}
        </a>
      </div>
    </div>
  );
}
