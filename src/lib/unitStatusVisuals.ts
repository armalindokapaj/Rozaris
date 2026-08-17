import type { Unit, UnitsConfig } from "@/lib/types";

/**
 * Units Blocks & POI Layer PRD §5 — "One centralized Status Visual
 * Registry." The single place that resolves a real Unit's status to its
 * admin-configured color, for the 3D unit-box overlay
 * (render-engine/unitRegistry.ts is the one real consumer today).
 *
 * `Project3DConfig.unitColorAvailable/Reserved/Sold/Selected` already
 * existed as real, admin-editable, persisted fields (project-3d-config's
 * route, adminEntities.ts) before this PRD — but a real, confirmed gap:
 * nothing in the rebuilt RenderEngine.ts ever read them, so every project
 * silently rendered the hardcoded UNIT_BOX_COLOR/SELECTED_COLOR constants
 * in viewerPresets.ts instead, regardless of what an admin configured.
 * This module is the fix — every status-color read for the 3D scene goes
 * through here, sourced from the real per-project config, falling back to
 * the exact same hex values viewerPresets.ts always used so an
 * unconfigured project renders identically to before.
 *
 * Deliberately scoped to the 3D unit-box system only (not the 2D Unit
 * Page/Listing/UnitsBar Tailwind status badges — `viewerPresets.ts`'s own
 * doc comment on `STATUS_COLOR` already documents that split as
 * intentional: 2D chrome uses design-token classes for theme/dark-mode
 * support, the GLB overlay needs raw hex for THREE.Color. Unifying those
 * two would mean either hardcoding hex into 2D badges (losing theming) or
 * threading Tailwind tokens into THREE.js (not how either system works) —
 * a real design cost the PRD's own "sold = red everywhere" goal doesn't
 * actually require, since the 2D badges already render sold as visually
 * distinct/red-family via their own tokens.
 */

export const DEFAULT_UNIT_STATUS_VISUAL_CONFIG: Pick<
  UnitsConfig,
  "unitColorAvailable" | "unitColorReserved" | "unitColorSold" | "unitColorSelected"
> = {
  unitColorAvailable: "#22c55e",
  unitColorReserved: "#eab308",
  unitColorSold: "#ef4444",
  unitColorSelected: "#6b55f5",
};

export const UNIT_STATUS_LABELS: Record<Unit["status"], string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

function hexToNumber(hex: string): number {
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A real Unit's status → its admin-configured hex string (e.g. "#ef4444"),
 * falling back to the platform default for any field a project's
 * Project3DConfig row doesn't have yet (or has no row at all — same
 * "config is optional, defaults apply" pattern every other *Config here
 * uses). */
export function unitStatusColorHex(
  status: Unit["status"],
  config?: Partial<Pick<UnitsConfig, "unitColorAvailable" | "unitColorReserved" | "unitColorSold">>
): string {
  switch (status) {
    case "available":
      return config?.unitColorAvailable ?? DEFAULT_UNIT_STATUS_VISUAL_CONFIG.unitColorAvailable;
    case "reserved":
      return config?.unitColorReserved ?? DEFAULT_UNIT_STATUS_VISUAL_CONFIG.unitColorReserved;
    case "sold":
      return config?.unitColorSold ?? DEFAULT_UNIT_STATUS_VISUAL_CONFIG.unitColorSold;
    default:
      return DEFAULT_UNIT_STATUS_VISUAL_CONFIG.unitColorAvailable;
  }
}

/** Same resolution, as a THREE.Color-ready numeric hex (0xrrggbb) — what
 * render-engine/unitRegistry.ts actually needs. */
export function unitStatusColorNumber(
  status: Unit["status"],
  config?: Partial<Pick<UnitsConfig, "unitColorAvailable" | "unitColorReserved" | "unitColorSold">>
): number {
  return hexToNumber(unitStatusColorHex(status, config));
}

/** The selection-outline color (PRD §12 — selected units keep their
 * status-color fill and gain this as an edge/outline, replacing the old
 * "selection replaces status color entirely" SELECTED_COLOR behavior). */
export function unitSelectedOutlineColorNumber(config?: Partial<Pick<UnitsConfig, "unitColorSelected">>): number {
  return hexToNumber(config?.unitColorSelected ?? DEFAULT_UNIT_STATUS_VISUAL_CONFIG.unitColorSelected);
}
