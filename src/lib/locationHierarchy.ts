export type LocationTypeValue = "municipality" | "city" | "village" | "neighborhood";

export const LOCATION_TYPES: LocationTypeValue[] = ["municipality", "city", "village", "neighborhood"];

export const ALLOWED_PARENT_TYPES: Record<LocationTypeValue, LocationTypeValue[]> = {
  municipality: [],
  city: ["municipality"],
  village: ["municipality"],
  neighborhood: ["city", "municipality"],
};
