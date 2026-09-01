import type { Project, Unit } from "./types";

export interface UnitBox {
  unit: Unit;
  buildingName: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  floorIndex: number;
  totalFloorsInBuilding: number;
}

export interface BuildingBlock {
  name: string;
  centerX: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
}

export interface ProjectLayout {
  buildings: BuildingBlock[];
  units: UnitBox[];
  boundingRadius: number;
  centerY: number;
}

const UNIT_WIDTH = 3.2;
const UNIT_DEPTH = 3;
const UNIT_HEIGHT = 1.6;
const UNIT_GAP = 0.3;
const BUILDING_GAP = 6;

export function computeProjectLayout(project: Project): ProjectLayout {
  const buildingNames =
    project.buildings.length > 0
      ? project.buildings
      : Array.from(new Set(project.units.map((u) => u.buildingName)));

  const buildings: BuildingBlock[] = [];
  const units: UnitBox[] = [];

  let cursorX = 0;
  let maxHeight = 0;

  for (const name of buildingNames) {
    const buildingUnits = project.units.filter((u) => u.buildingName === name);
    if (buildingUnits.length === 0) continue;

    const floorMap = new Map<number, Unit[]>();
    for (const u of buildingUnits) {
      const list = floorMap.get(u.floor) ?? [];
      list.push(u);
      floorMap.set(u.floor, list);
    }
    const floorNumbers = Array.from(floorMap.keys()).sort((a, b) => a - b);
    const unitsPerFloorMax = Math.max(...floorNumbers.map((f) => floorMap.get(f)!.length));

    const buildingWidth = unitsPerFloorMax * (UNIT_WIDTH + UNIT_GAP) - UNIT_GAP;
    const buildingHeight = floorNumbers.length * (UNIT_HEIGHT + UNIT_GAP);
    const centerX = cursorX + buildingWidth / 2;

    floorNumbers.forEach((floorNum, floorIdx) => {
      const floorUnits = [...floorMap.get(floorNum)!].sort((a, b) =>
        a.code.localeCompare(b.code)
      );
      const rowWidth = floorUnits.length * (UNIT_WIDTH + UNIT_GAP) - UNIT_GAP;
      const startX = centerX - rowWidth / 2 + UNIT_WIDTH / 2;
      floorUnits.forEach((unit, i) => {
        units.push({
          unit,
          buildingName: name,
          x: startX + i * (UNIT_WIDTH + UNIT_GAP),
          y: floorIdx * (UNIT_HEIGHT + UNIT_GAP) + UNIT_HEIGHT / 2,
          z: 0,
          width: UNIT_WIDTH,
          height: UNIT_HEIGHT,
          depth: UNIT_DEPTH,
          floorIndex: floorIdx,
          totalFloorsInBuilding: floorNumbers.length,
        });
      });
    });

    buildings.push({
      name,
      centerX,
      z: 0,
      width: buildingWidth,
      depth: UNIT_DEPTH,
      height: buildingHeight,
      floors: floorNumbers.length,
    });

    maxHeight = Math.max(maxHeight, buildingHeight);
    cursorX += buildingWidth + BUILDING_GAP;
  }

  const totalWidth = Math.max(0, cursorX - BUILDING_GAP);
  const offsetX = totalWidth / 2;
  for (const b of buildings) b.centerX -= offsetX;
  for (const u of units) u.x -= offsetX;

  const boundingRadius = Math.max(totalWidth, maxHeight, UNIT_WIDTH) * 0.75 + 6;

  return { buildings, units, boundingRadius, centerY: maxHeight / 2 };
}

export interface MassingBox {
  name: string;
  offsetXM: number;
  offsetZM: number;
  widthM: number;
  depthM: number;
  heightM: number;
}

const MASSING_FLOOR_HEIGHT_M = 3;

export function computeProjectMassing(project: Project): MassingBox[] {
  return computeProjectLayout(project).buildings.map((b) => ({
    name: b.name,
    offsetXM: b.centerX,
    offsetZM: b.z,
    widthM: b.width,
    depthM: b.depth,
    heightM: b.floors * MASSING_FLOOR_HEIGHT_M,
  }));
}
