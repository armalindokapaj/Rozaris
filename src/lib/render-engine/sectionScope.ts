import type { DetailModelSlotRole } from "@/lib/types";

/** Which loaded detail-model slots a Section's clipping volume is allowed
 * to cut.
 *
 * A Section is an ARCHITECTURAL cut — "show me floor 7 of this building".
 * Its volume is a finite rotated prism (sections.ts), so anything outside
 * that footprint is erased outright, not sliced. Applied to the whole
 * scene that erases every surrounding-site GLB the moment a visitor opens
 * a floor from the unit card or the floor rail: on tower-vlora the six
 * "Site 1".."site 6" slots (the streets/neighbouring blocks around the
 * tower) vanished together with the part of the building above the cut,
 * leaving the plan floating in empty space. Reported 2026-08-27, "Section
 * plan does not effect on: Site models GLB" — i.e. it must not.
 *
 * The rule is deliberately BLANKET (no per-slot switch to remember to
 * set) and keys off what the admin already tells us about a slot:
 *
 *  - `role`: `surroundings` and `context` are exactly this concept and
 *    already exist in the schema — anything an admin files under those is
 *    site context by definition.
 *  - `name`: every slot the Scene tab's own "+" creates is `role:
 *    "custom"` (the strip has no role picker), so role alone would miss
 *    every real site slot on tower-vlora. A leading "site"/"terrain"/
 *    "landscape"/"surroundings"/"context" word — the naming already in
 *    use — carries the same meaning, and a `\b` boundary keeps it from
 *    swallowing e.g. "Sitework Tower".
 *
 * Everything else — Building, Floors, Units and any other custom slot —
 * stays inside the clipping group and is cut exactly as before, which is
 * the entire point of the feature. Note the two consequences that fall
 * out of the engine's existing structure rather than needing their own
 * code: an exempt slot is no longer walked by `collectClippableMeshes()`,
 * so it gets no BackSide "fill the gaps" twin either (correct — an uncut
 * mesh leaves no gap to fill), and it keeps counting toward
 * `frameLoadedContent()`'s bounds, since it is still a loaded root. */
const SITE_SLOT_NAME_RE = /^\s*(site|terrain|landscape|surroundings?|context)\b/i;

export interface SectionScopeSlot {
  slotRole?: DetailModelSlotRole;
  slotName?: string;
}

/** True when an active Section should clip this slot's GLB. */
export function isSlotCutBySections(slot: SectionScopeSlot): boolean {
  if (slot.slotRole === "surroundings" || slot.slotRole === "context") return false;
  if (slot.slotName && SITE_SLOT_NAME_RE.test(slot.slotName)) return false;
  return true;
}

/** Human-readable half of the same rule, for the Sections panel's own
 * explanatory line — kept next to the regex so the two can't drift. */
export const SECTION_SITE_EXEMPT_HINT =
  'Sections never cut site context: slots with the Surroundings/Context role, or whose name starts with "Site", "Terrain", "Landscape", "Surroundings" or "Context".';
