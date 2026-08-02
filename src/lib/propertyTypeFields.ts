import type { PropertyType } from "./types";

/** Each property type surfaces only the "main filters" that actually apply
 * to it — e.g. a studio has no bedrooms field, land has no bedrooms/baths
 * but does have a building-permit field. Shared between the Front Page's
 * filter panel (which fields to show for the active type) and the
 * publisher dashboard's new-listing form (which fields are required for
 * the chosen type). */
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
