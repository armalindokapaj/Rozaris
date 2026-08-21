"use client";

import { useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";

/**
 * All mock listing/project prices are stored in EUR. This converts to the
 * globally-selected display currency (using the daily-cached EUR->ALL rate)
 * before formatting, so the header currency toggle actually changes what's
 * shown everywhere prices appear.
 */
export function usePriceFormat() {
  const currency = useAppStore((s) => s.currency);
  const rate = useAppStore((s) => s.eurToAllRate);
  const locale = useAppStore((s) => s.locale);

  return useCallback(
    (amountEur: number, opts: { compact?: boolean } = {}) => {
      const amount = currency === "ALL" ? Math.round(amountEur * rate) : amountEur;
      return formatPrice(amount, currency, { ...opts, locale });
    },
    [currency, rate, locale]
  );
}
