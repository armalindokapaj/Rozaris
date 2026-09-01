"use client";

import { forwardRef } from "react";
import { Box, X } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useT } from "@/lib/i18n/useT";
import type { Project } from "@/lib/types";

export const ProjectPopupCard = forwardRef<HTMLDivElement, {
  project: Project;
  onClose: () => void;
  style?: React.CSSProperties;
}>(function ProjectPopupCard({ project, onClose, style }, ref) {
  const { t } = useT();
  return (
    <div
      ref={ref}
      className="absolute z-40 w-72 -translate-x-1/2 -translate-y-[calc(100%+16px)] overflow-hidden rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-2)]"
      style={style}
      role="dialog"
      aria-label={`${project.name} project`}
    >
      <div className="relative h-28">
        <PlaceholderImage seed={project.slug} kind="hero" className="h-full w-full" watermark />
        <button
          onClick={onClose}
          aria-label={t("map.closePopup")}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {project.premium && (
          <span className="absolute left-2 top-2 rounded-full bg-listing-premium px-2 py-0.5 text-[11px] font-semibold text-white">
            {t("results.premium")}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-listing-new-dev">
          {project.developer.name}
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{project.availableUnits}</span>{" "}
          {t("map.unitsAvailableSuffix")}
        </p>
        <a
          href={`/project/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Box className="h-4 w-4" />
          {t("results.exploreIn3d")}
        </a>
      </div>
    </div>
  );
});
