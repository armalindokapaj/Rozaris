"use client";

import { useState } from "react";
import { BedDouble, Bath, Ruler, Layers, X, Heart, SquareStack, Palette } from "lucide-react";
import { Gallery } from "@/components/listing/Gallery";
import { PublisherCard } from "@/components/listing/PublisherCard";
import { useAppStore } from "@/lib/store";
import { formatPrice, cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/constants";
import type { Project, Unit } from "@/lib/types";

export function UnitDetailPanel({
  project,
  unit,
  onClose,
}: {
  project: Project;
  unit: Unit;
  onClose: () => void;
}) {
  const [designLeadSent, setDesignLeadSent] = useState(false);
  const compare = useAppStore((s) => s.compare);
  const addCompare = useAppStore((s) => s.addCompare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);
  const auth = useAppStore((s) => s.auth);
  const saved = useAppStore((s) => s.saved.projects.includes(project.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedProject);

  const compareIndex = compare.findIndex((c) => c.kind === "unit" && c.entity.id === unit.id);
  const inCompare = compareIndex !== -1;
  const eligibleForDesign = project.status === "under_construction" && unit.type === "residential";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal>
      <button
        aria-label="Close unit detail"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/45 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-panel bg-white shadow-2xl lg:max-h-[88vh] lg:rounded-panel">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <div>
            <p className="text-base font-bold text-neutral-900">{unit.code}</p>
            <p className="text-xs text-neutral-500">{project.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-5">
          <Gallery seedBase={unit.id} photoCount={3} />

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xl font-bold text-neutral-900">
              {formatPrice(unit.price, unit.currency)}
            </p>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                unit.status === "available" && "bg-green-100 text-green-700",
                unit.status === "reserved" && "bg-amber-100 text-amber-700",
                unit.status === "sold" && "bg-neutral-100 text-neutral-500"
              )}
            >
              {unit.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <MiniFact icon={BedDouble} value={unit.bedrooms} label="Beds" />
            <MiniFact icon={Bath} value={unit.bathrooms} label="Baths" />
            <MiniFact icon={Ruler} value={`${unit.area} m²`} label="Area" />
            <MiniFact icon={Layers} value={unit.floor} label="Floor" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => auth.signedIn && toggleSaved(project.id)}
              disabled={!auth.signedIn}
              className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              <Heart className={cn("h-4 w-4", saved && "fill-red-500 text-red-500")} />
              {saved ? "Saved" : "Save project"}
            </button>
            <button
              onClick={() =>
                inCompare
                  ? removeCompareAt(compareIndex)
                  : addCompare({
                      kind: "unit",
                      entity: unit,
                      projectName: project.name,
                      projectSlug: project.slug,
                    })
              }
              disabled={unit.status === "sold"}
              className={cn(
                "flex items-center gap-1.5 rounded-control px-3.5 py-2 text-sm font-semibold disabled:opacity-40",
                inCompare
                  ? "bg-brand-500 text-white"
                  : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              <SquareStack className="h-4 w-4" />
              {inCompare ? "In compare" : "Compare"}
            </button>
            {eligibleForDesign && (
              <button
                onClick={() => setDesignLeadSent(true)}
                disabled={designLeadSent}
                className="flex items-center gap-1.5 rounded-control bg-listing-new-dev px-3.5 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              >
                <Palette className="h-4 w-4" />
                {designLeadSent ? "Request sent" : "Design this Apartment"}
              </button>
            )}
          </div>

          <div className="mt-6">
            <PublisherCard
              publisher={project.developer}
              whatsappMessage={`Hi, I'm interested in unit ${unit.code} at ${project.name}`}
              contentTitle={`${project.name} — ${unit.code}`}
              contentUrl={`${SITE_URL}/project/${project.slug}?unit=${unit.id}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniFact({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BedDouble;
  value: string | number;
  label: string;
}) {
  return (
    <div className="rounded-card border border-neutral-200 p-2.5 text-center">
      <Icon className="mx-auto h-4 w-4 text-brand-500" />
      <p className="mt-1 text-sm font-bold text-neutral-900">{value}</p>
      <p className="text-[10px] text-neutral-500">{label}</p>
    </div>
  );
}
