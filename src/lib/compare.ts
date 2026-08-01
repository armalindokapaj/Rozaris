import { getNeighborhood } from "./mockData";
import type { CompareEntity } from "./types";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS } from "./constants";
import { transactionLabel } from "./utils";

export interface CompareRow {
  label: string;
  values: [string, string];
}

const DASH = "—";

export function compareTitle(item: CompareEntity): string {
  return item.kind === "listing" ? item.entity.title : `${item.projectName} · ${item.entity.code}`;
}

export function compareImage(item: CompareEntity): string {
  return item.kind === "listing" ? item.entity.id : `${item.projectSlug}-${item.entity.id}`;
}

export function compareHref(item: CompareEntity): string {
  return item.kind === "listing"
    ? `/listing/${item.entity.slug}`
    : `/project/${item.projectSlug}?unit=${item.entity.id}`;
}

export function comparePrice(item: CompareEntity) {
  const e = item.entity;
  return { price: e.price, currency: e.currency };
}

export function buildCompareRows(items: [CompareEntity, CompareEntity]): CompareRow[] {
  const [a, b] = items;

  const field = (
    label: string,
    fn: (i: CompareEntity) => string | number | null | undefined
  ): CompareRow => {
    const va = fn(a);
    const vb = fn(b);
    return {
      label,
      values: [
        va === null || va === undefined || va === "" ? DASH : String(va),
        vb === null || vb === undefined || vb === "" ? DASH : String(vb),
      ],
    };
  };

  return [
    field("Price", (i) => `${i.entity.currency === "EUR" ? "€" : "L"}${i.entity.price.toLocaleString()}`),
    field("Price / m²", (i) =>
      i.kind === "listing" && i.entity.pricePerSqm
        ? `${i.entity.currency === "EUR" ? "€" : "L"}${Math.round(i.entity.pricePerSqm).toLocaleString()}`
        : i.kind === "unit"
        ? `${i.entity.currency === "EUR" ? "€" : "L"}${Math.round(i.entity.price / i.entity.area).toLocaleString()}`
        : null
    ),
    field("Area", (i) => `${i.entity.area} m²`),
    field("Bedrooms", (i) => i.entity.bedrooms),
    field("Bathrooms", (i) => i.entity.bathrooms),
    field("Floor", (i) =>
      i.kind === "listing" ? i.entity.floor ?? null : i.entity.floor
    ),
    field("Property type", (i) =>
      i.kind === "listing" ? PROPERTY_TYPE_LABELS[i.entity.propertyType] : "Project unit"
    ),
    field("Transaction", (i) =>
      i.kind === "listing"
        ? transactionLabel(i.entity.transaction, i.entity.rentSubtype)
        : transactionLabel(i.entity.transaction)
    ),
    field("Parking", (i) =>
      i.kind === "listing"
        ? i.entity.amenities.includes("parking")
          ? "Yes"
          : "No"
        : null
    ),
    field("Balcony / terrace", (i) =>
      i.kind === "listing"
        ? i.entity.amenities.includes("balcony") || i.entity.amenities.includes("terrace")
          ? "Yes"
          : "No"
        : null
    ),
    field("Furnished", (i) =>
      i.kind === "listing" ? (i.entity.amenities.includes("furnished") ? "Yes" : "No") : null
    ),
    field("Neighborhood", (i) =>
      i.kind === "listing" ? getNeighborhood(i.entity.neighborhoodId)?.name ?? null : null
    ),
    field("Publisher", (i) => (i.kind === "listing" ? i.entity.publisher.name : i.projectName)),
    field("Availability", (i) =>
      i.kind === "listing" ? "Available" : i.entity.status === "available" ? "Available" : i.entity.status
    ),
  ];
}

export { AMENITY_LABELS };
