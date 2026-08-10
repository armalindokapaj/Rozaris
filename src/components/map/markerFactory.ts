// Pure-DOM marker builders for Mapbox GL. Kept outside React so the
// imperative Mapbox marker lifecycle (add/remove) never fights React's
// reconciliation — see MapView for how these are mounted/unmounted.

const ICON_BUILDING = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>`;
const ICON_HOME = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>`;
const ICON_TOWER = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v18"/><path d="M13 22V9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v13"/><path d="M2 22h20M9 7h.01M9 11h.01M9 15h.01M17 12h.01M17 16h.01"/></svg>`;

export const COLORS = {
  standard: "#6f9bff",
  selected: "#6b55f5",
  newDev: "#8b5cf6",
  premium: "#c9973f",
  unavailable: "#9a9aa3",
  neutral: "#17171c",
};

export function buildClusterMarker(name: string, count: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "rz-marker rz-marker-cluster";
  el.innerHTML = `<strong>${count}</strong><span>${name}</span>`;
  return el;
}

export function buildListingMarker(opts: {
  tier: "icon" | "price";
  priceLabel: string;
  /** Shown instead of priceLabel once selected — the mini card's own
   * "View Unit" call to action (a second click navigates). */
  viewUnitLabel: string;
  isNewDev?: boolean;
  premium?: boolean;
  selected?: boolean;
  propertyType: string;
  buildingCount?: number;
}): HTMLDivElement {
  const wrapper = document.createElement("div");
  // Mapbox mounts this directly inside its own absolutely-positioned marker
  // div, which has no definite width — a plain block `wrapper` (width:auto)
  // stretches to fill that ambiguous width instead of shrink-wrapping the
  // price pill, which is what made the pill balloon out (border-radius:999px
  // on an oversized box reads as one huge stretched capsule). inline-block
  // forces it to size to its content, like the icon/cluster markers already do.
  wrapper.style.display = "inline-block";
  wrapper.style.position = "relative";

  const el = document.createElement("div");

  if (opts.tier === "icon") {
    const bg = opts.selected
      ? COLORS.selected
      : opts.premium
      ? COLORS.premium
      : opts.isNewDev
      ? COLORS.newDev
      : COLORS.standard;
    el.style.background = bg;
    el.className = "rz-marker rz-marker-icon";
    el.innerHTML =
      opts.propertyType === "house" || opts.propertyType === "villa"
        ? ICON_HOME
        : ICON_BUILDING;
  } else {
    // Standalone listings (never ones synthesized from a New Project — those
    // are represented by the project's own marker instead) only need a
    // price-only pill here, not a full mini card.
    el.className = cardClassName(opts);
    el.textContent = opts.selected ? opts.viewUnitLabel : opts.priceLabel;
  }

  wrapper.appendChild(el);

  if (opts.buildingCount && opts.buildingCount > 1) {
    const badge = document.createElement("div");
    badge.className = "rz-marker-badge";
    badge.textContent = `+${opts.buildingCount - 1}`;
    wrapper.appendChild(badge);
  }

  return wrapper;
}

function cardClassName(opts: { selected?: boolean; premium?: boolean }): string {
  return [
    "rz-marker-price-card",
    opts.selected && "rz-marker-price-card-selected",
    opts.premium && "rz-marker-price-card-premium",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildProjectMarker(opts: {
  selected?: boolean;
  premium?: boolean;
}): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "rz-marker rz-marker-project";
  el.style.background = opts.selected ? COLORS.selected : COLORS.newDev;
  if (opts.premium) {
    el.style.boxShadow = `0 0 0 3px ${COLORS.premium}55, 0 4px 14px -2px rgba(23,22,38,.35)`;
  }
  el.innerHTML = ICON_TOWER;
  return el;
}
