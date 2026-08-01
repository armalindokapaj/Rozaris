"use client";

import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

/** Static sponsored-slot creative — not wired to any real ad system, just a
 * fixed placement in the sidebar above the Mortgage calculator. */
export function AdBanner() {
  const { t } = useT();

  return (
    <div className="flex items-center gap-3 rounded-card bg-gradient-to-br from-neutral-900 to-neutral-700 p-4 text-white">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Sparkles className="h-5 w-5 text-brand-300" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {t("adBanner.studioName")}
          <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-white/40">
            {t("adBanner.eyebrow")}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-white/60">{t("adBanner.tagline")}</p>
      </div>
    </div>
  );
}
