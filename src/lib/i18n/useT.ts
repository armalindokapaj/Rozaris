"use client";

import { useCallback } from "react";
import { useAppStore } from "@/lib/store";
import en, { type Dictionary } from "./en";
import sq from "./sq";
import type { Locale } from "@/lib/types";

const dictionaries: Record<Locale, Dictionary> = { en, sq };

function lookup(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict);
}

/** Translate a dot-path key (e.g. "nav.buy") for the current locale, with optional {var} interpolation. */
export function useT() {
  const locale = useAppStore((s) => s.locale);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key);
      let text = typeof raw === "string" ? raw : key;
      if (vars) {
        for (const [varName, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${varName}}`, String(value));
        }
      }
      return text;
    },
    [locale]
  );

  return { t, locale };
}
