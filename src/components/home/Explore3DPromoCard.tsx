"use client";

import Link from "next/link";
import { Box } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

export function Explore3DPromoCard() {
  const { t } = useT();
  return (
    <div className="mx-4 flex items-center justify-between gap-3 rounded-card bg-brand-50 p-4">
      <div>
        <p className="text-sm font-semibold text-brand-700">{t("home.explore3dTitle")}</p>
        <p className="mt-0.5 max-w-[220px] text-xs text-brand-600/80">{t("home.explore3dBody")}</p>
        <Link
          href="/help#3d-map"
          className="mt-3 inline-block rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white"
        >
          {t("home.learnMore")}
        </Link>
      </div>
      <Box className="h-14 w-14 shrink-0 text-brand-300" strokeWidth={1.25} />
    </div>
  );
}
