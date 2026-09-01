import type { PropertyType } from "./types";

export type PropertyMainField = "bedrooms" | "bathrooms" | "area" | "landSize" | "buildingPermit";

export const TYPE_MAIN_FIELDS: Partial<Record<PropertyType, PropertyMainField[]>> = {
  apartment: ["bedrooms", "bathrooms", "area"],
  villa: ["bedrooms", "bathrooms", "area", "landSize"],
  studio: ["area"],
  land: ["area", "buildingPermit"],
  office: ["area"],
  commercial: ["area"],
};

export const DEFAULT_MAIN_FIELDS: PropertyMainField[] = ["area", "bedrooms", "bathrooms"];

export function mainFieldsFor(type: PropertyType | null | undefined): PropertyMainField[] {
  return (type && TYPE_MAIN_FIELDS[type]) || DEFAULT_MAIN_FIELDS;
}
