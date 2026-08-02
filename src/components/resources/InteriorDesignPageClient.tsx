"use client";

import { useState } from "react";
import { Sparkles, LayoutGrid, PackageSearch, UserCheck, TrendingUp, Info } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatPrice, cn } from "@/lib/utils";

type Scope = "room" | "unit";
type RoomType = "kitchen" | "bathroom" | "bedroom" | "living";
type Tier = "essential" | "premium" | "luxury";

const ROOM_TYPES: RoomType[] = ["kitchen", "bathroom", "bedroom", "living"];
const ROOM_LABEL_KEY: Record<RoomType, string> = {
  kitchen: "interiorDesign.roomKitchen",
  bathroom: "interiorDesign.roomBathroom",
  bedroom: "interiorDesign.roomBedroom",
  living: "interiorDesign.roomLiving",
};
const ROOM_DEFAULT_AREA: Record<RoomType, number> = {
  kitchen: 12,
  bathroom: 6,
  bedroom: 14,
  living: 20,
};

const TIERS: Tier[] = ["essential", "premium", "luxury"];
const TIER_LABEL_KEY: Record<Tier, string> = {
  essential: "interiorDesign.tierEssential",
  premium: "interiorDesign.tierPremium",
  luxury: "interiorDesign.tierLuxury",
};
// Illustrative €/m² range per design tier.
const TIER_RATE: Record<Tier, [number, number]> = {
  essential: [80, 120],
  premium: [150, 220],
  luxury: [250, 400],
};

const WHY_ITEMS = [
  { icon: LayoutGrid, titleKey: "interiorDesign.whyPlanningTitle", bodyKey: "interiorDesign.whyPlanningBody" },
  { icon: PackageSearch, titleKey: "interiorDesign.whySourcingTitle", bodyKey: "interiorDesign.whySourcingBody" },
  { icon: UserCheck, titleKey: "interiorDesign.whyManagementTitle", bodyKey: "interiorDesign.whyManagementBody" },
  { icon: TrendingUp, titleKey: "interiorDesign.whyValueTitle", bodyKey: "interiorDesign.whyValueBody" },
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

export function InteriorDesignPageClient() {
  const { t } = useT();
  const [scope, setScope] = useState<Scope>("unit");
  const [roomType, setRoomType] = useState<RoomType>("kitchen");
  const [area, setArea] = useState(60);
  const [tier, setTier] = useState<Tier>("premium");

  function selectScope(next: Scope) {
    setScope(next);
    setArea(next === "room" ? ROOM_DEFAULT_AREA[roomType] : 60);
  }

  function selectRoomType(next: RoomType) {
    setRoomType(next);
    setArea(ROOM_DEFAULT_AREA[next]);
  }

  const [rateMin, rateMax] = TIER_RATE[tier];
  const estimateMin = Math.round(area * rateMin);
  const estimateMax = Math.round(area * rateMax);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <div className="rounded-panel bg-gradient-to-br from-neutral-900 to-neutral-700 p-6 text-white sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
          {t("interiorDesign.pageSubtitle")}
        </p>
        <div className="mt-2 flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-brand-300" />
          <h1 className="text-xl font-bold sm:text-2xl">{t("interiorDesign.pageTitle")}</h1>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">{t("interiorDesign.heroBody")}</p>
      </div>

      <section className="mt-8">
        <h2 className="text-base font-bold text-neutral-900">{t("interiorDesign.whyTitle")}</h2>
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

      <section className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("interiorDesign.estimatorTitle")}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t("interiorDesign.estimatorSubtitle")}</p>

        <div className="mt-4 space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("interiorDesign.scopeLabel")}
            </span>
            <div className="flex gap-2">
              <Pill active={scope === "room"} onClick={() => selectScope("room")}>
                {t("interiorDesign.scopeRoom")}
              </Pill>
              <Pill active={scope === "unit"} onClick={() => selectScope("unit")}>
                {t("interiorDesign.scopeUnit")}
              </Pill>
            </div>
          </div>

          {scope === "room" && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("interiorDesign.roomTypeLabel")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_TYPES.map((r) => (
                  <Pill key={r} active={roomType === r} onClick={() => selectRoomType(r)}>
                    {t(ROOM_LABEL_KEY[r])}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("interiorDesign.areaLabel")}
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
                {t("interiorDesign.tierLabel")}
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
          <p className="text-xs font-medium text-brand-700">{t("interiorDesign.estimatedRangeLabel")}</p>
          <p className="mt-1 text-2xl font-bold text-brand-800">
            {formatPrice(estimateMin, "EUR")} – {formatPrice(estimateMax, "EUR")}
          </p>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("interiorDesign.estimatorDisclaimer")}
        </p>
      </section>
    </div>
  );
}
