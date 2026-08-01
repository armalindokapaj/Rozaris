import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { formatPrice } from "@/lib/utils";
import type { Project } from "@/lib/types";

/** ARC-004 / A11Y non-3D equivalent: full inventory + facts, no WebGL required. */
export function SimplifiedProjectView({ project }: { project: Project }) {
  const prices = project.units.map((u) => u.price);
  const minPrice = Math.min(...prices);

  return (
    <div className="h-full w-full overflow-y-auto scroll-thin bg-white pt-24">
      <PlaceholderImage seed={project.slug} kind="hero" className="aspect-[21/9] w-full" />
      <div className="mx-auto max-w-2xl px-5 py-6">
        <h1 className="text-2xl font-bold text-neutral-900">{project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          by {project.developer.name} · {project.completionLabel}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-600">{project.description}</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Available units" value={project.availableUnits} />
          <Stat label="Total units" value={project.totalUnits} />
          <Stat label="From" value={formatPrice(minPrice, "EUR", { compact: true })} />
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
