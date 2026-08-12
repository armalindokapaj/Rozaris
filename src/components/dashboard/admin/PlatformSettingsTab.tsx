"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";

const STUB_SECTION_KEYS = [
  "search",
  "publishing",
  "verification",
  "threeD",
  "map",
  "seo",
  "promotions",
  "notifications",
  "security",
] as const;

/** Admin's Platform Settings tab (PRD_ROZARIS_User_Types §5 "Platform
 * configuration") — absorbs the existing EUR→ALL exchange-rate editor
 * (the one setting that's genuinely wired end-to-end today) as its first
 * real section, with the PRD's other settings groups shown as honest
 * placeholders rather than faked controls with nothing behind them. */
export function PlatformSettingsTab() {
  const { t } = useT();
  const rate = useAppStore((s) => s.eurToAllRate);
  const updatedAt = useAppStore((s) => s.eurToAllRateUpdatedAt);
  const setEurToAllRate = useAppStore((s) => s.setEurToAllRate);
  const [input, setInput] = useState(String(rate));
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const parsed = Math.round(Number(input));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setEurToAllRate(parsed, new Date().toISOString());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.platformSettingsTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.platformSettingsSubtitle")}</p>
      </div>

      <div className="max-w-sm space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.currencyTitle")}</h2>
        <p className="-mt-2 text-xs text-neutral-500">{t("admin.currencySubtitle")}</p>
        <div>
          <p className="text-xs font-medium text-neutral-500">{t("admin.currentRateLabel")}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{t("admin.currentRateValue", { rate })}</p>
          <p className="mt-1 text-xs text-neutral-400">
            {updatedAt ? t("admin.lastUpdated", { date: new Date(updatedAt).toLocaleString() }) : t("admin.neverUpdated")}
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newRateLabel")}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <button
          onClick={handleSave}
          className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t("admin.saveRate")}
        </button>
        {saved && (
          <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">{t("admin.rateSaved")}</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-neutral-900">{t("admin.otherSettingsTitle")}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STUB_SECTION_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center gap-2.5 rounded-card border border-dashed border-neutral-200 bg-white p-3 text-neutral-400"
            >
              <Lock className="h-4 w-4 shrink-0" />
              <span className="text-sm">{t(`admin.settingsGroup.${key}`)}</span>
              <span className="ml-auto text-[11px] font-medium">{t("admin.notYetWired")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
