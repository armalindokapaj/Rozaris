"use client";

import { useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";

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
