import type { Section, Unit } from "@/lib/types";
import { makeFloorId } from "@/lib/units";

/**
 * Links a real `Unit` to the `Section` that cuts its floor open — the data
 * half of the unit card's "View in Floor" button (2026-08-25 direct
 * instruction: "detect the name of the section and attach it to each unit
 * with that floor number... automatically link unit floor number with the
 * section named after each floor").
 *
 * The linkage is derived, never stored: an admin names a section after the
 * floor it cuts ("Floor 7", "Kati 7") and every unit on floor 7 picks it up
 * the moment the config saves. Nothing has to be re-linked when inventory
 * changes, and a project with 20 floor sections needs 20 names, not 20 × N
 * unit rows of join data.
 *
 * Why parse the name rather than add a `floor` field to `Section`: the
 * instruction was explicit about the name being the signal, and a name is
 * the one part of a section an admin already has to fill in and can see in
 * the list. `Section.floorId` (which predates this) stays authoritative
 * where it's set — see `resolveFloorSection`.
 */

/** English + Albanian words that mean "storey", longest-first so `kati`
 * wins over `kat` (the separator pattern below would otherwise have to
 * swallow the stray "i"). No Albanian diacritics in any of these, but the
 * input is stripped of combining marks anyway — an admin typing "Niveli"
 * from a phone keyboard shouldn't silently fail to link. */
const FLOOR_WORDS = ["floors", "floor", "kati", "kat", "niveli", "nivel", "levels", "level", "storey", "story", "etazhi", "etazh"];
const WORDS = FLOOR_WORDS.join("|");

/** `Floor 7`, `Kati 7`, `Floor-7`, `Floor #7`, `Tower A — Level 3`, and
 * (second pattern) `7th Floor`, `7 Kati`. Both require the number to sit
 * *adjacent* to the keyword, separated by nothing more than space and one
 * piece of punctuation.
 *
 * The separator deliberately only swallows a dash that is flush against
 * the keyword: `Floor-1` is floor 1 written with a hyphen, `Floor -1` is
 * the basement. Nothing else can tell those two apart, and both are real
 * ways to write a section name. */
const LEADING = new RegExp(`(?:^|[^a-z0-9])(?:${WORDS})(?:\\s*[:.#]|[-–—])?\\s*(-?\\d{1,3})(?![0-9])`, "i");
const TRAILING = new RegExp(`(?:^|[^a-z0-9])(-?\\d{1,3})\\s*(?:st|nd|rd|th)?\\s*(?:${WORDS})(?![a-z])`, "i");

/**
 * The floor number a section's name declares, or null if it doesn't
 * declare one.
 *
 * The adjacency requirement is the whole point, and it is what keeps the
 * editor's own default names out of the way: `SectionsPanel` creates
 * sections called "Floor Section 1", "Floor Section 2", … where the number
 * is a sequence counter, not a storey — and in those the keyword is
 * followed by a word, not a number, so they parse to null rather than
 * hijacking floor 1. ("Section 1" and its Albanian equivalent "Prerje 1"
 * carry no keyword at all and were never at risk.) The cost is a false
 * negative on a section genuinely named "Floor Section 8"; the admin
 * panel shows each section's detected floor so that reads as a missing
 * chip rather than a mystery.
 */
export function parseSectionFloorNumber(name: string): number | null {
  const normalized = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const match = LEADING.exec(normalized) ?? TRAILING.exec(normalized);
  if (!match) return null;
  const floor = Number.parseInt(match[1], 10);
  return Number.isFinite(floor) ? floor : null;
}

/**
 * The section that cuts this unit's floor open, or null if nobody has
 * authored one yet (the common case on a project where, per the same
 * instruction, "one section already exist" and the rest are still to be
 * drawn — the button simply doesn't render).
 *
 * Precedence, strongest signal first:
 *  1. `Section.floorId` — a real explicit assignment against the same
 *     `` `${buildingName}::${floor}` `` composite identity
 *     `groupUnitsByFloor` derives and `BuildingNavRail`/`UnitsPanel`
 *     already filter on. It predates this feature and nothing in the
 *     editor writes it today, but an explicit link must still beat a
 *     parsed one the day something does.
 *  2. The name, narrowed to this unit's own building when a section is
 *     scoped to one. A project-scoped "Floor 7" serves every building;
 *     a building-scoped one only its own, which matters the moment a
 *     project has two towers whose floor 7s are different heights.
 *
 * `hidden` sections are skipped outright — that flag already means
 * "keep the record, keep it out of the viewer".
 */
export function resolveFloorSection(sections: Section[], unit: Unit): Section | null {
  return resolveSectionForFloor(sections, unit.buildingName, unit.floor);
}

/**
 * Same resolution, addressed by the floor itself rather than by a unit
 * standing on it — what the viewer's floor rail needs, since a rail entry
 * exists for a floor whether or not any unit on it is currently selected.
 *
 * `resolveFloorSection` above is now a thin wrapper over this: a unit is
 * only ever a `(buildingName, floor)` pair as far as this lookup is
 * concerned, and having two copies of the precedence rules would be two
 * places to get them wrong.
 */
export function resolveSectionForFloor(sections: Section[], buildingName: string, floor: number): Section | null {
  const visible = sections.filter((s) => !s.hidden);
  const floorId = makeFloorId(buildingName, floor);
  const explicit = visible.find((s) => s.floorId === floorId);
  if (explicit) return explicit;

  const named = visible.filter((s) => parseSectionFloorNumber(s.name) === floor);
  if (named.length === 0) return null;
  return named.find((s) => s.scope === "building" && s.buildingName === buildingName) ?? named[0];
}
