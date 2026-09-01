import type { Section, Unit } from "@/lib/types";
import { resolveSectionForFloor } from "@/lib/floorSections";
import { groupUnitsByFloor } from "@/lib/units";

export interface FloorRailEntry {
  floor: number;
  floorId: string;
  buildingName: string;
  unitIds: string[];
  unitCount: number;
  sectionId: string | null;
}

export interface FloorRailBuilding {
  name: string;
  floors: FloorRailEntry[];
}

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
