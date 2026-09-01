import type { Amenity, Condition, EssentialPOI, Locale, PropertyType, SortOption } from "./types";

export const PROPERTY_TYPE_LABELS: Record<Locale, Record<PropertyType, string>> = {
  en: {
    apartment: "Apartment",
    house: "House",
    villa: "Villa",
    studio: "Studio",
    land: "Land",
    commercial: "Commercial",
    office: "Office",
  },
  sq: {
    apartment: "Apartament",
    house: "Shtëpi",
    villa: "Vilë",
    studio: "Studio",
    land: "Tokë",
    commercial: "Ambient komercial",
    office: "Zyrë",
  },
};

export const CONDITION_LABELS: Record<Locale, Record<Condition, string>> = {
  en: {
    new: "New",
    renovated: "Renovated",
    good: "Good",
    needs_renovation: "Needs renovation",
  },
  sq: {
    new: "E re",
    renovated: "E rinovuar",
    good: "Në gjendje të mirë",
    needs_renovation: "Ka nevojë për rinovim",
  },
};

export const AMENITY_LABELS: Record<Locale, Record<Amenity, string>> = {
  en: {
    elevator: "Elevator",
    parking: "Parking",
    garage: "Garage",
    balcony: "Balcony",
    terrace: "Terrace",
    garden: "Garden",
    pool: "Pool",
    accessibility: "Accessibility",
    furnished: "Furnished",
  },
  sq: {
    elevator: "Ashensor",
    parking: "Parking",
    garage: "Garazh",
    balcony: "Ballkon",
    terrace: "Tarracë",
    garden: "Kopsht",
    pool: "Pishinë",
    accessibility: "I përshtatur për aksesueshmëri",
    furnished: "I/e mobiluar",
  },
};

export const AMENITY_KEYS = Object.keys(AMENITY_LABELS.en) as Amenity[];

export const POI_LABELS: Record<Locale, Record<EssentialPOI, string>> = {
  en: {
    school: "School",
    university: "University",
    bus_stop: "Bus stop",
    hospital: "Hospital",
  },
  sq: {
    school: "Shkollë",
    university: "Universitet",
    bus_stop: "Stacion autobusi",
    hospital: "Spital",
  },
};

export const SORT_LABELS: Record<Locale, Record<SortOption, string>> = {
  en: {
    recommended: "Recommended",
    premium: "Premium / relevance",
    newest: "Newest",
    price_asc: "Price: low to high",
    price_desc: "Price: high to low",
    area_desc: "Area: largest",
    area_asc: "Area: smallest",
    distance: "Distance to map center",
  },
  sq: {
    recommended: "Të rekomanduara",
    premium: "Premium / relevancë",
    newest: "Më të rejat",
    price_asc: "Çmimi: nga më i ulëti",
    price_desc: "Çmimi: nga më i larti",
    area_desc: "Sipërfaqja: më e madhja",
    area_asc: "Sipërfaqja: më e vogla",
    distance: "Largësia nga qendra e hartës",
  },
};

export const MOBILE_BREAKPOINT = 1024;

export const SELECTED_UNIT_ZOOM = 17.5;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rozaris.al";
