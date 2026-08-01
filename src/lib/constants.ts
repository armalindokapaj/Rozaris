import type { Amenity, Condition, EssentialPOI, PropertyType, SortOption } from "./types";

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  house: "House",
  villa: "Villa",
  studio: "Studio",
  land: "Land",
  commercial: "Commercial",
  office: "Office",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  renovated: "Renovated",
  good: "Good",
  needs_renovation: "Needs renovation",
};

export const AMENITY_LABELS: Record<Amenity, string> = {
  elevator: "Elevator",
  parking: "Parking",
  garage: "Garage",
  balcony: "Balcony",
  terrace: "Terrace",
  garden: "Garden",
  pool: "Pool",
  accessibility: "Accessibility",
  furnished: "Furnished",
};

export const POI_LABELS: Record<EssentialPOI, string> = {
  school: "School",
  university: "University",
  bus_stop: "Bus stop",
  hospital: "Hospital",
};

export const SORT_LABELS: Record<SortOption, string> = {
  recommended: "Recommended",
  premium: "Premium / relevance",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  area_desc: "Area: largest",
  area_asc: "Area: smallest",
  distance: "Distance to map center",
};

export const MOBILE_BREAKPOINT = 1024;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rozaris.al";
