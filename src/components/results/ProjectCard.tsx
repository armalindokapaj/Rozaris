"use client";

import Link from "next/link";
import { Box } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { getNeighborhood } from "@/lib/mockData";
import { SELECTED_UNIT_ZOOM } from "@/lib/constants";
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
        requestFlyTo({ lat: project.coords.lat, lng: project.coords.lng, zoom: SELECTED_UNIT_ZOOM });
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "flex h-full cursor-pointer flex-col overflow-hidden rounded-card border transition-colors",
        project.premium ? "bg-amber-50/70" : "bg-white",
        isActive
          ? "border-listing-new-dev shadow-[var(--shadow-1)]"
          : project.premium
          ? "border-listing-premium/50"
          : "border-neutral-200 hover:border-neutral-300",
        // Applied whenever premium, not only in the non-active branch above —
        // otherwise hovering the card sets hoveredId (for map-marker sync),
        // which flips isActive and would silently swallow the effect.
        project.premium && "hover:z-10 hover:border-listing-premium hover:shadow-[var(--shadow-1)]"
      )}
    >
      <div className="relative aspect-[4/3] w-full shrink-0">
        <PlaceholderImage seed={project.slug} kind="hero" className="h-full w-full" watermark />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          <span className="rounded-full bg-listing-new-dev px-2 py-1 text-[11px] font-semibold text-white shadow">
            {t("results.newProject")}
          </span>
          {/* No "Premium" text badge — premium status reads through the
              amber tint/border and hover treatment only. */}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="truncate font-serif text-base text-neutral-900">{project.name}</p>
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
        {/* Details opens the editorial Project Detail Page (the authoritative
            info/inventory page — PRD_Project_Detail_Page §1); 3D stays a
            distinct, explicit escape hatch into the Three.js viewer. */}
        <div className="mt-auto flex items-center gap-1.5">
          <Link
            href={`/projects/${project.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-1 items-center justify-center rounded-control border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {t("results.viewDetails")}
          </Link>
          <a
            href={`/project/${project.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("results.exploreIn3d")}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center rounded-control bg-neutral-900 px-2.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            <Box className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
