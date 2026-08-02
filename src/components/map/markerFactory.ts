// Pure-DOM marker builders for Mapbox GL. Kept outside React so the
// imperative Mapbox marker lifecycle (add/remove) never fights React's
// reconciliation — see MapView for how these are mounted/unmounted.

const ICON_BUILDING = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>`;
const ICON_HOME = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>`;
const ICON_TOWER = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v18"/><path d="M13 22V9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v13"/><path d="M2 22h20M9 7h.01M9 11h.01M9 15h.01M17 12h.01M17 16h.01"/></svg>`;

export const COLORS = {
  standard: "#6f9bff",
  selected: "#6d5bf6",
  newDev: "#8b5cf6",
  premium: "#c9973f",
  unavailable: "#b9b6c9",
  neutral: "#2c2a3d",
};

// Same deterministic gradient-swatch technique as PlaceholderImage, so the
// price-tier marker's mini thumbnail reads as "the same card, smaller"
// rather than a different visual language — duplicated here (not imported)
// since this module stays outside React for the imperative marker lifecycle.
const THUMB_GRADIENTS: Array<[string, string]> = [
  ["#e9e5ff", "#c9c1ff"],
  ["#dcebff", "#b7d4ff"],
  ["#ffe9d6", "#ffd2a8"],
  ["#e3f3ea", "#bfe4cf"],
  ["#f3e3f0", "#e3bfe0"],
  ["#eef1ff", "#d3d9ff"],
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function thumbGradient(seed: string): string {
  const [from, to] = THUMB_GRADIENTS[hashSeed(seed) % THUMB_GRADIENTS.length];
  const angle = (hashSeed(seed + "a") % 4) * 45;
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

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
  /** Seeds the mini card's thumbnail gradient — same technique as
   * PlaceholderImage, so it reads as "the listing card, smaller". */
  seed: string;
}): HTMLDivElement {
  const wrapper = document.createElement("div");
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
    // Mini card: small thumbnail + price, same layout language as the
    // listing cards elsewhere in the app, just shrunk down for the map.
    el.className = cardClassName(opts);
    const thumb = document.createElement("span");
    thumb.className = "rz-marker-thumb";
    thumb.style.backgroundImage = thumbGradient(opts.seed);
    el.appendChild(thumb);
    const label = document.createElement("span");
    label.textContent = opts.selected ? opts.viewUnitLabel : opts.priceLabel;
    el.appendChild(label);
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
