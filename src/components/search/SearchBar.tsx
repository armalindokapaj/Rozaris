"use client";

import { useMemo, useRef, useState } from "react";
import { Search, MapPin, Building2, LandPlot, X } from "lucide-react";
import { publishers, CITY } from "@/lib/mockData";
import { defaultFilters, useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useLiveProjects } from "@/hooks/useLiveProjects";
import { useLiveListings } from "@/hooks/useLiveListings";
import { useLocations } from "@/hooks/useLocations";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

type Suggestion = {
  id: string;
  label: string;
  sublabel: string;
  type: "city" | "neighborhood" | "developer" | "project";
  target?: { lat: number; lng: number; zoom?: number };
};

function buildSuggestions(
  query: string,
  t: ReturnType<typeof useT>["t"],
  projects: Project[],
  neighborhoodSuggestions: Suggestion[]
): Suggestion[] {
  const q = query.trim().toLowerCase();
  const all: Suggestion[] = [
    {
      id: "city-tirana",
      label: CITY,
      sublabel: t("search.cityLabel"),
      type: "city",
      target: { lat: 41.3275, lng: 19.8187, zoom: 12.2 },
    },
    ...neighborhoodSuggestions,
    ...projects.map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: t("search.projectSuffix", { developer: p.developer.name }),
      type: "project" as const,
      target: { lat: p.coords.lat, lng: p.coords.lng, zoom: 16.5 },
    })),
    ...publishers
      .filter((p) => p.type === "developer")
      .map((p) => ({
        id: p.id,
        label: p.name,
        sublabel: t("search.developerLabel"),
        type: "developer" as const,
      })),
  ];
  if (!q) return all.slice(0, 6);
  return all.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 8);
}

const TYPE_ICON = {
  city: MapPin,
  neighborhood: MapPin,
  developer: Building2,
  project: LandPlot,
};

export function SearchBar({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setFilters = useAppStore((s) => s.setFilters);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);
  const setMode = useAppStore((s) => s.setMode);
  const location = useAppStore((s) => s.filters.location);
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);
  const liveProjects = useAppStore((s) => s.liveProjects);
  const liveListings = useAppStore((s) => s.liveListings);
  useLiveProjects();
  useLiveListings();
  const neighborhoodLocations = useLocations("neighborhood");

  const neighborhoodSuggestions = useMemo<Suggestion[]>(() => {
    const counts = new Map<string, number>();
    for (const l of liveListings ?? []) {
      if (!l.neighborhoodId) continue;
      counts.set(l.neighborhoodId, (counts.get(l.neighborhoodId) ?? 0) + 1);
    }
    for (const p of liveProjects ?? []) {
      if (!p.neighborhoodId) continue;
      counts.set(p.neighborhoodId, (counts.get(p.neighborhoodId) ?? 0) + 1);
    }
    return neighborhoodLocations
      .map((n) => ({ n, count: counts.get(n.id) ?? 0 }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count)
      .map(({ n, count }) => ({
        id: n.id,
        label: n.officialName,
        sublabel: t("search.neighborhoodSuffix", { count }),
        type: "neighborhood" as const,
        target:
          n.latitude != null && n.longitude != null
            ? { lat: n.latitude, lng: n.longitude, zoom: 15.2 }
            : undefined,
      }));
  }, [liveListings, liveProjects, neighborhoodLocations, t]);

  const suggestions = useMemo(
    () => buildSuggestions(query, t, liveProjects ?? [], neighborhoodSuggestions),
    [query, t, liveProjects, neighborhoodSuggestions]
  );

  function selectSuggestion(s: Suggestion) {
    setQuery(s.label);
    setFilters({ location: s.label });
    setOpen(false);
    if (s.target) {
      requestFlyTo(s.target);
      setMode("map");
    }
  }

  function clearSearch() {
    setQuery("");
    setFilters({ location: defaultFilters.location });
    setOpen(false);
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-none border border-neutral-300 bg-white shadow-none focus-within:border-neutral-800 focus-within:ring-1 focus-within:ring-neutral-800",
          compact ? "px-2.5 py-2" : "h-10 px-3"
        )}
      >
        <Search className={cn("shrink-0 text-neutral-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          type="text"
          placeholder={t("search.placeholder")}
          aria-label={t("search.ariaLabel")}
          className="w-full bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
        />
        {(query || location !== defaultFilters.location) && (
          <button
            aria-label={t("search.clear")}
            onClick={clearSearch}
            className="shrink-0 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-2 max-h-80 overflow-y-auto scroll-thin rounded-card border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)]"
        >
          {suggestions.map((s) => {
            const Icon = TYPE_ICON[s.type];
            return (
              <button
                key={s.id}
                role="option"
                aria-selected={false}
                onClick={() => selectSuggestion(s)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-neutral-100"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <Icon className="h-4 w-4 text-neutral-500" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-neutral-800">
                    {s.label}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {s.sublabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
