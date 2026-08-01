"use client";

import { useMemo, useRef, useState } from "react";
import { Building2, Waves, Home as HomeIcon, ChevronDown, Check } from "lucide-react";
import { ProjectListRow } from "@/components/project/ProjectListRow";
import { useT } from "@/lib/i18n/useT";
import { useClickOutside } from "@/hooks/useClickOutside";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import type { Project, ProjectSetting, PropertyType } from "@/lib/types";
import { cn } from "@/lib/utils";

const SETTINGS: ProjectSetting[] = ["residential_complex", "beach", "tower"];

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

// Only the property types relevant to new-development browsing (not the
// full catalog used by the resale FiltersForm, e.g. no land/commercial).
const FILTERABLE_PROPERTY_TYPES: PropertyType[] = ["apartment", "studio", "villa"];

type PriceBucketId = "0-150k" | "150k-300k" | "300k-1m";
const PRICE_BUCKETS: { id: PriceBucketId; labelKey: string; test: (price: number) => boolean }[] = [
  { id: "0-150k", labelKey: "newProjectsPage.price0To150k", test: (p) => p < 150_000 },
  { id: "150k-300k", labelKey: "newProjectsPage.price150kTo300k", test: (p) => p >= 150_000 && p < 300_000 },
  { id: "300k-1m", labelKey: "newProjectsPage.price300kToMillion", test: (p) => p >= 300_000 },
];

function projectFromPrice(project: Project): number | null {
  return project.units.length ? Math.min(...project.units.map((u) => u.price)) : null;
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

/** Click-to-open popup filter (City, Price Range) — distinct from the
 * always-visible pill filters, for options with more items than fit inline. */
function PopoverFilter({
  label,
  activeCount,
  children,
}: {
  label: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className={cn("relative", open && "z-40")} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-control border px-3 py-2.5 text-left text-sm font-medium transition-colors",
          activeCount > 0
            ? "border-brand-500 bg-brand-50 text-brand-700"
            : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
        )}
      >
        <span>
          {label}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1.5 rounded-card border border-neutral-200 bg-white p-1.5 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}

function PopoverOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
    >
      {children}
      {active && <Check className="h-3.5 w-3.5 text-brand-500" />}
    </button>
  );
}

export function NewProjectsClient({ projects }: { projects: Project[] }) {
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const [cities, setCities] = useState<string[]>([]);
  const [settings, setSettings] = useState<ProjectSetting[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [priceBuckets, setPriceBuckets] = useState<PriceBucketId[]>([]);

  const cityOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.city))).sort(),
    [projects]
  );

  const filtered = useMemo(
    () =>
      projects
        .filter((p) => {
          if (cities.length > 0 && !cities.includes(p.city)) return false;
          if (settings.length > 0 && !settings.includes(p.setting)) return false;
          if (propertyTypes.length > 0 && !propertyTypes.includes(p.propertyType)) return false;
          if (priceBuckets.length > 0) {
            const from = projectFromPrice(p);
            if (from == null) return false;
            const buckets = PRICE_BUCKETS.filter((b) => priceBuckets.includes(b.id));
            if (!buckets.some((b) => b.test(from))) return false;
          }
          return true;
        })
        // Premium projects are always prioritized, here as everywhere else.
        .sort((a, b) => Number(b.premium) - Number(a.premium)),
    [projects, cities, settings, propertyTypes, priceBuckets]
  );

  const activeFilterCount =
    cities.length + settings.length + propertyTypes.length + priceBuckets.length;

  return (
    // Same p-4 outer spacing as the Front Page's row container, so the left
    // panel sits the exact same distance from the header and viewport edge
    // as the Front Page's left filters panel.
    <div className="px-4 py-4 lg:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left panel: page intro + all filters, self-contained and sticky —
            doesn't intervene with the right panel's results at all. Same
            glass-panel shell, header treatment, and width as the Front
            Page's left filters panel for visual consistency. */}
        <aside className="glass-panel shrink-0 overflow-hidden rounded-panel shadow-sm lg:sticky lg:top-20 lg:w-72">
          <div className="border-b border-neutral-100 px-5 pt-5 pb-4">
            <h1 className="text-[17px] font-bold text-neutral-900">
              {t("newProjectsPage.title")}
            </h1>
            <p className="mt-1.5 text-sm text-neutral-500">{t("newProjectsPage.subtitle")}</p>
          </div>

          <div className="p-5">
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setCities([]);
                setSettings([]);
                setPropertyTypes([]);
                setPriceBuckets([]);
              }}
              className="mb-3 text-xs font-medium text-brand-600 hover:underline"
            >
              {t("newProjectsPage.clearAll")}
            </button>
          )}

          <div className="space-y-2">
            <PopoverFilter label={t("newProjectsPage.cityLabel")} activeCount={cities.length}>
              {cityOptions.map((city) => (
                <PopoverOption key={city} active={cities.includes(city)} onClick={() => setCities((c) => toggle(c, city))}>
                  {city}
                </PopoverOption>
              ))}
            </PopoverFilter>
          </div>

          <div className="mt-3 space-y-2">
            <PopoverFilter label={t("newProjectsPage.priceLabel")} activeCount={priceBuckets.length}>
              {PRICE_BUCKETS.map((b) => (
                <PopoverOption
                  key={b.id}
                  active={priceBuckets.includes(b.id)}
                  onClick={() => setPriceBuckets((v) => toggle(v, b.id))}
                >
                  {t(b.labelKey)}
                </PopoverOption>
              ))}
            </PopoverFilter>
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {t("newProjectsPage.propertyTypeLabel")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FILTERABLE_PROPERTY_TYPES.map((pt) => (
                <button
                  key={pt}
                  onClick={() => setPropertyTypes((v) => toggle(v, pt))}
                  aria-pressed={propertyTypes.includes(pt)}
                  className={cn(
                    "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
                    propertyTypes.includes(pt)
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                  )}
                >
                  {propertyTypeLabels[pt]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {t("newProjectsPage.preferenceLabel")}
            </p>
            <div className="flex flex-col gap-1.5">
              {SETTINGS.map((setting) => {
                const Icon = SETTING_ICON[setting];
                const active = settings.includes(setting);
                return (
                  <button
                    key={setting}
                    onClick={() => setSettings((s) => toggle(s, setting))}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(SETTING_LABEL_KEY[setting])}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </aside>

        {/* Right panel: results only. */}
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
              {t("newProjectsPage.noProjectsMatch")}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => (
                <ProjectListRow key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
