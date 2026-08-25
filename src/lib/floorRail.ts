import type { Section, Unit } from "@/lib/types";
import { resolveSectionForFloor } from "@/lib/floorSections";
import { groupUnitsByFloor } from "@/lib/units";

/**
 * The public viewer's floor rail — the vertical stack of floor numbers
 * that sits down the left edge of the 3D viewport while the Units module
 * is open, top floor at the top, ground floor at the bottom (2026-08-25
 * direct instruction: "vertically, all the floors, ground floor is to the
 * bottom, top floor is at the top... get the floors that are added on the
 * units").
 *
 * "Get the floors that are added on the units" is literal, and it is the
 * reason this derives from `groupUnitsByFloor` rather than from any floor
 * count on the project: the rail lists exactly the floors real inventory
 * stands on. A tower whose published units are floors 6, 7 and 8 gets a
 * three-entry rail even if the building has twelve storeys — there is
 * nothing for a visitor to look at on the other nine, and inventing rows
 * for them would be inventing data.
 *
 * Each entry carries the section that cuts it open (or `null`), resolved
 * through the exact same precedence the unit card's own "View in Floor"
 * button already uses — `Section.floorId` first, then the section's name
 * parsed for a floor number. One resolver, so the rail and the card can
 * never disagree about which cut belongs to floor 8.
 */
export interface FloorRailEntry {
  /** `Unit.floor` — the real storey number, negative for basements. */
  floor: number;
  /** `${buildingName}::${floor}`, the composite `Section.floorId` stores. */
  floorId: string;
  buildingName: string;
  /** Every unit standing on this floor — the camera framing target when
   * this floor is picked (see RenderEngine.revealUnits). */
  unitIds: string[];
  unitCount: number;
  /** The section that cuts this floor open. `null` means no admin has
   * authored one yet, which renders the entry as a real but disabled
   * row rather than hiding it (2026-08-25 decision: "list all floors,
   * disable the rest") — a floor with inventory on it is worth showing
   * even when there is nothing to cut. */
  sectionId: string | null;
}

export interface FloorRailBuilding {
  name: string;
  /** Descending — top floor first, so the array reads the way the rail
   * is drawn and no consumer has to remember to reverse it. */
  floors: FloorRailEntry[];
}

/**
 * One rail model per building. Buildings are kept apart rather than
 * merged into a single list of distinct floor numbers because a cut is a
 * world-space plane at one height: "floor 7" of a 3.2m-storey tower and
 * "floor 7" of its 4m-storey neighbour are two different planes, and a
 * merged rail would have to silently pick one of them. Projects with a
 * single building — every project on the platform today — get an array of
 * one and the rail draws no building switcher at all.
 */
export function buildFloorRail(units: Unit[], sections: Section[]): FloorRailBuilding[] {
  return groupUnitsByFloor(units).map((building) => ({
    name: building.name,
    floors: building.floors.map((group): FloorRailEntry => {
      const section = resolveSectionForFloor(sections, building.name, group.floor);
      return {
        floor: group.floor,
        floorId: group.floorId,
        buildingName: building.name,
        unitIds: group.units.map((u) => u.id),
        unitCount: group.units.length,
        sectionId: section?.id ?? null,
      };
    }),
  }));
}
