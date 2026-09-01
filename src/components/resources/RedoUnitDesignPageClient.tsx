"use client";

import { useMemo, useState } from "react";
import {
  Hammer,
  Gauge,
  ClipboardCheck,
  TrendingUp,
  UserCheck,
  Minus,
  Plus,
  ChefHat,
  ShowerHead,
  BedDouble,
  Sofa,
  Trees,
  DoorOpen,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { formatPrice, cn } from "@/lib/utils";
import type { PropertyType } from "@/lib/types";

type RedoUnitType = Exclude<PropertyType, "land">;
type Tier = "essential" | "premium" | "luxury";
type ItemKey = "kitchen" | "bathroom" | "bedroom" | "living" | "balcony" | "hallway";

const UNIT_TYPES: RedoUnitType[] = ["apartment", "studio", "villa", "house", "office", "commercial"];
const UNIT_TYPE_MULTIPLIER: Record<RedoUnitType, number> = {
  apartment: 1,
  studio: 0.9,
  villa: 1.2,
  house: 1.05,
  office: 0.85,
  commercial: 0.8,
};

const TIERS: Tier[] = ["essential", "premium", "luxury"];
const TIER_LABEL_KEY: Record<Tier, string> = {
  essential: "redoDesign.tierEssential",
  premium: "redoDesign.tierPremium",
  luxury: "redoDesign.tierLuxury",
};
const TIER_RATE: Record<Tier, [number, number]> = {
  essential: [90, 140],
  premium: [160, 240],
  luxury: [260, 420],
};

const WHY_ITEMS = [
  { icon: Gauge, titleKey: "redoDesign.whySpeedTitle", bodyKey: "redoDesign.whySpeedBody" },
  { icon: ClipboardCheck, titleKey: "redoDesign.whyPermitsTitle", bodyKey: "redoDesign.whyPermitsBody" },
  { icon: TrendingUp, titleKey: "redoDesign.whyUpliftTitle", bodyKey: "redoDesign.whyUpliftBody" },
  { icon: UserCheck, titleKey: "redoDesign.whyStressTitle", bodyKey: "redoDesign.whyStressBody" },
];

const ITEMS: { key: ItemKey; icon: typeof ChefHat; labelKey: string; range: [number, number] }[] = [
  { key: "kitchen", icon: ChefHat, labelKey: "redoDesign.itemKitchen", range: [3500, 7000] },
  { key: "bathroom", icon: ShowerHead, labelKey: "redoDesign.itemBathroom", range: [1800, 3500] },
  { key: "bedroom", icon: BedDouble, labelKey: "redoDesign.itemBedroom", range: [1200, 2500] },
  { key: "living", icon: Sofa, labelKey: "redoDesign.itemLiving", range: [1500, 3200] },
  { key: "balcony", icon: Trees, labelKey: "redoDesign.itemBalcony", range: [800, 1600] },
  { key: "hallway", icon: DoorOpen, labelKey: "redoDesign.itemHallway", range: [500, 1200] },
];

function Pill({
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
      )}
    >
      {children}
    </button>
  );
}

export function RedoUnitDesignPageClient() {
  const { t, locale } = useT();
  const [unitType, setUnitType] = useState<RedoUnitType>("apartment");
  const [area, setArea] = useState(75);
  const [tier, setTier] = useState<Tier>("premium");
  const [counts, setCounts] = useState<Record<ItemKey, number>>({
    kitchen: 0,
    bathroom: 0,
    bedroom: 0,
    living: 0,
    balcony: 0,
    hallway: 0,
  });

  const [rateMin, rateMax] = TIER_RATE[tier];
  const multiplier = UNIT_TYPE_MULTIPLIER[unitType];
  const estimateMin = Math.round(area * rateMin * multiplier);
  const estimateMax = Math.round(area * rateMax * multiplier);

  function adjustCount(key: ItemKey, delta: number) {
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  }

  const { totalMin, totalMax, hasSelection } = useMemo(() => {
    let min = 0;
    let max = 0;
    let any = false;
    for (const item of ITEMS) {
      const qty = counts[item.key];
      if (qty > 0) any = true;
      min += qty * item.range[0];
      max += qty * item.range[1];
    }
    return { totalMin: min, totalMax: max, hasSelection: any };
  }, [counts]);

  return (
    <div className="px-4 py-4 lg:p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <div className="rounded-panel bg-gradient-to-br from-neutral-900 to-neutral-700 p-6 text-white sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              {t("redoDesign.pageSubtitle")}
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <Hammer className="h-5 w-5 text-brand-300" />
              <h1 className="font-serif text-xl sm:text-2xl">{t("redoDesign.pageTitle")}</h1>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">{t("redoDesign.heroBody")}</p>
          </div>

          <section>
            <h2 className="text-base font-bold text-neutral-900">{t("redoDesign.whyTitle")}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {WHY_ITEMS.map(({ icon: Icon, titleKey, bodyKey }) => (
                <div key={titleKey} className="rounded-card border border-neutral-200 bg-white p-4">
                  <Icon className="h-5 w-5 text-brand-500" />
                  <p className="mt-2 text-sm font-bold text-neutral-900">{t(titleKey)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{t(bodyKey)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-panel border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-bold text-neutral-900">{t("redoDesign.typeEstimatorTitle")}</h2>
            <p className="mt-1 text-xs text-neutral-500">{t("redoDesign.typeEstimatorSubtitle")}</p>

            <div className="mt-4 space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  {t("redoDesign.unitTypeLabel")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {UNIT_TYPES.map((ut) => (
                    <Pill key={ut} active={unitType === ut} onClick={() => setUnitType(ut)}>
                      {PROPERTY_TYPE_LABELS[locale][ut]}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                    {t("redoDesign.areaLabel")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={area}
                    onChange={(e) => setArea(Math.max(1, Number(e.target.value)))}
                    className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
                  />
                </label>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                    {t("redoDesign.tierLabel")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIERS.map((tr) => (
                      <Pill key={tr} active={tier === tr} onClick={() => setTier(tr)}>
                        {t(TIER_LABEL_KEY[tr])}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-card bg-brand-50 p-4">
              <p className="text-xs font-medium text-brand-700">{t("redoDesign.estimatedRangeLabel")}</p>
              <p className="mt-1 text-2xl font-bold text-brand-800">
                {formatPrice(estimateMin, "EUR")} – {formatPrice(estimateMax, "EUR")}
              </p>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
              {t("redoDesign.estimatorDisclaimer")}
            </p>
          </section>
        </div>

        <aside className="glass-panel overflow-hidden rounded-panel lg:sticky lg:top-20 lg:self-start">
          <div className="border-b border-neutral-100 px-5 pt-5 pb-4">
            <h2 className="text-[15px] font-bold text-neutral-900">{t("redoDesign.pickerTitle")}</h2>
            <p className="mt-1 text-xs text-neutral-500">{t("redoDesign.pickerSubtitle")}</p>
          </div>

          <div className="divide-y divide-neutral-100">
            {ITEMS.map(({ key, icon: Icon, labelKey, range }) => {
              const qty = counts[key];
              const itemLabel = t(labelKey);
              return (
                <div key={key} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                    <Icon className="h-4.5 w-4.5 text-brand-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">{itemLabel}</p>
                    <p className="text-[11px] text-neutral-500">
                      {formatPrice(range[0], "EUR")}–{formatPrice(range[1], "EUR")} {t("redoDesign.perItemLabel")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustCount(key, -1)}
                      disabled={qty === 0}
                      aria-label={t("redoDesign.decreaseAria", { item: itemLabel })}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-4 text-center text-sm font-bold tabular-nums text-neutral-900">{qty}</span>
                    <button
                      type="button"
                      onClick={() => adjustCount(key, 1)}
                      aria-label={t("redoDesign.increaseAria", { item: itemLabel })}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-neutral-100 p-5">
            {hasSelection ? (
              <>
                <p className="text-xs font-medium text-brand-700">{t("redoDesign.totalLabel")}</p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {formatPrice(totalMin, "EUR")} – {formatPrice(totalMax, "EUR")}
                </p>
              </>
            ) : (
              <p className="text-xs text-neutral-400">{t("redoDesign.emptySelection")}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
