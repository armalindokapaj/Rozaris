import { getNeighborhood } from "./mockData";
import { projectUnitListingsFrom } from "./projects";
import { computeRankScore, DEFAULT_SEARCH_RANKING_WEIGHTS, type SearchRankingWeights } from "./searchRanking";
import type { FilterState, Listing, Project } from "./types";
import type { MapBounds } from "./store";

function inBounds(coords: { lat: number; lng: number }, bounds: MapBounds | null) {
  if (!bounds) return true;
  return (
    coords.lat <= bounds.north &&
    coords.lat >= bounds.south &&
    coords.lng <= bounds.east &&
    coords.lng >= bounds.west
  );
}

export function matchesListingFilters(listing: Listing, f: FilterState): boolean {
  if (listing.status !== "active") return false;
  if (f.transaction === "buy" && listing.transaction === "rent") return false;
  if (f.transaction === "rent" && listing.transaction !== "rent") return false;
  if (
    f.transaction === "rent" &&
    f.rentSubtype &&
    listing.rentSubtype !== f.rentSubtype
  )
    return false;
  if (
    f.propertyTypes.length &&
    !f.propertyTypes.includes(listing.propertyType)
  )
    return false;
  if (f.priceMin != null && listing.price < f.priceMin) return false;
  if (f.priceMax != null && listing.price > f.priceMax) return false;
  if (f.areaMin != null && listing.area < f.areaMin) return false;
  if (f.areaMax != null && listing.area > f.areaMax) return false;
  if (f.landAreaMin != null && (listing.landArea == null || listing.landArea < f.landAreaMin))
    return false;
  if (f.landAreaMax != null && (listing.landArea == null || listing.landArea > f.landAreaMax))
    return false;
  if (f.buildingPermit && !listing.buildingPermit) return false;
  if (f.bedrooms != null && listing.bedrooms < f.bedrooms) return false;
  if (f.bathrooms != null && listing.bathrooms < f.bathrooms) return false;
  if (f.condition.length && !f.condition.includes(listing.condition))
    return false;
  if (f.amenities.length && !f.amenities.every((a) => listing.amenities.includes(a)))
    return false;
  if (f.essentialPOIs.length) {
    const n = getNeighborhood(listing.neighborhoodId);
    if (!n || !f.essentialPOIs.every((p) => n.essentialPOIs.includes(p)))
      return false;
  }
  if (f.verifiedOnly && !listing.publisher.verified) return false;
  if (f.premiumOnly && !listing.premium) return false;
  if (f.projectsOnly) return false;
  return true;
}

export function matchesProjectFilters(project: Project, f: FilterState): boolean {
  if (f.transaction === "rent") return false;                                                
  if (f.priceMin != null || f.priceMax != null) {
    const prices = project.units.map((u) => u.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (f.priceMin != null && max < f.priceMin) return false;
    if (f.priceMax != null && min > f.priceMax) return false;
  }
  if (f.verifiedOnly && !project.developer.verified) return false;
  if (f.premiumOnly && !project.premium) return false;
  return true;
}

export function sortEntities<T extends { premium: boolean }>(
  items: T[],
  sort: FilterState["sort"],
  getPrice: (item: T) => number,
  getArea: (item: T) => number,
  getDate: (item: T) => string
): T[] {
  const copy = [...items];
  switch (sort) {
    case "premium":
      return copy.sort((a, b) => Number(b.premium) - Number(a.premium));
    case "newest":
      return copy.sort(
        (a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime()
      );
    case "price_asc":
      return copy.sort((a, b) => getPrice(a) - getPrice(b));
    case "price_desc":
      return copy.sort((a, b) => getPrice(b) - getPrice(a));
    case "area_desc":
      return copy.sort((a, b) => getArea(b) - getArea(a));
    case "area_asc":
      return copy.sort((a, b) => getArea(a) - getArea(b));
    default:
      return copy.sort((a, b) => {
        if (a.premium !== b.premium) return Number(b.premium) - Number(a.premium);
        return new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime();
      });
  }
}

export function getVisibleListings(
  f: FilterState,
  bounds: MapBounds | null,
  restrictToBounds: boolean,
  liveListings: Listing[] | null,
  liveProjects: Project[] | null,
  rankWeights: SearchRankingWeights = DEFAULT_SEARCH_RANKING_WEIGHTS
): Listing[] {
  const searchableListings = [...(liveListings ?? []), ...projectUnitListingsFrom(liveProjects ?? [])];
  const filtered = searchableListings.filter(
    (l) =>
      matchesListingFilters(l, f) &&
      (!restrictToBounds || inBounds(l.coords, bounds))
  );
  if (f.sort === "recommended") {
    return [...filtered].sort((a, b) => computeRankScore(b, rankWeights) - computeRankScore(a, rankWeights));
  }
  return sortEntities(
    filtered,
    f.sort,
    (l) => l.price,
    (l) => l.area,
    (l) => l.createdAt
  );
}

export function getVisibleProjects(
  f: FilterState,
  bounds: MapBounds | null,
  restrictToBounds: boolean,
  liveProjects: Project[] | null
): Project[] {
  const filtered = (liveProjects ?? []).filter(
    (p) =>
      matchesProjectFilters(p, f) &&
      (!restrictToBounds || inBounds(p.coords, bounds))
  );
  return sortEntities(
    filtered,
    f.sort,
    (p) => Math.min(...p.units.map((u) => u.price)),
    () => 0,
    () => new Date().toISOString()
  );
}
