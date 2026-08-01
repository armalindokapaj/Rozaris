"use client";

import { useT } from "@/lib/i18n/useT";

export function SkipLink() {
  const { t } = useT();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-neutral-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
    >
      {t("common.skipToMainContent")}
    </a>
  );
}
