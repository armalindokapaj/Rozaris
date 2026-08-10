"use client";

import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import type { Project } from "@/lib/types";

/** ARC-004 / A11Y non-3D equivalent: full inventory + facts, no WebGL required. */
export function SimplifiedProjectView({ project }: { project: Project }) {
  const prices = project.units.map((u) => u.price);
  const minPrice = Math.min(...prices);
  const priceFmt = usePriceFormat();
  const { t, locale } = useT();

  return (
    <div className="h-full w-full overflow-y-auto scroll-thin bg-white pt-24">
      <PlaceholderImage seed={project.slug} kind="hero" className="aspect-[21/9] w-full" watermark />
      <div className="mx-auto max-w-2xl px-5 py-6">
        <h1 className="font-serif text-2xl text-neutral-900">{project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t("project.byDeveloper", { developer: project.developer.name })} · {project.completionLabel}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-600">
          {project.description[locale]}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label={t("project.availableUnits")} value={project.availableUnits} />
          <Stat label={t("project.totalUnits")} value={project.totalUnits} />
          <Stat label={t("map.from")} value={priceFmt(minPrice, { compact: true })} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-neutral-200 p-3 text-center">
      <p className="text-sm font-bold text-neutral-900">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}
