"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "./useClickOutside";

/**
 * Shared open/close + outside-click boilerplate for popover-style
 * dropdowns. Before this existed, FilterDropdown, SortDropdown,
 * LanguageCurrencySelector and AccountMenu each hand-rolled the same
 * `useState` + `useRef` + `useClickOutside` triple independently — this
 * is that pattern, factored out once. Each dropdown still owns its own
 * trigger markup (a filter pill, a text link, an avatar, etc. all look
 * different on purpose); only the panel shell should come from
 * `DropdownPanel`/`DropdownMenuItem` in `@/components/ui/Dropdown`.
 */
export function useDropdown<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return {
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
    ref,
  };
}
