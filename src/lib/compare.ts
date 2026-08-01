import { getNeighborhood } from "./mockData";
import type { CompareEntity, Locale } from "./types";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS } from "./constants";
import { transactionLabel } from "./utils";
import en from "./i18n/en";
import sq from "./i18n/sq";

const fieldLabels = { en: en.compareFields, sq: sq.compareFields };

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

export function buildCompareRows(
  items: [CompareEntity, CompareEntity],
  locale: Locale
): CompareRow[] {
  const [a, b] = items;
  const f = fieldLabels[locale];
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const yesNo = (v: boolean) => (v ? f.yes : f.no);

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
    field(f.price, (i) => `${i.entity.currency === "EUR" ? "€" : "L"}${i.entity.price.toLocaleString()}`),
    field(f.pricePerSqm, (i) =>
      i.kind === "listing" && i.entity.pricePerSqm
        ? `${i.entity.currency === "EUR" ? "€" : "L"}${Math.round(i.entity.pricePerSqm).toLocaleString()}`
        : i.kind === "unit"
        ? `${i.entity.currency === "EUR" ? "€" : "L"}${Math.round(i.entity.price / i.entity.area).toLocaleString()}`
        : null
    ),
    field(f.area, (i) => `${i.entity.area} m²`),
    field(f.bedrooms, (i) => i.entity.bedrooms),
    field(f.bathrooms, (i) => i.entity.bathrooms),
    field(f.floor, (i) =>
      i.kind === "listing" ? i.entity.floor ?? null : i.entity.floor
    ),
    field(f.propertyType, (i) =>
      i.kind === "listing" ? propertyTypeLabels[i.entity.propertyType] : f.projectUnit
    ),
    field(f.transaction, (i) =>
      i.kind === "listing"
        ? transactionLabel(i.entity.transaction, i.entity.rentSubtype, locale)
        : transactionLabel(i.entity.transaction, undefined, locale)
    ),
    field(f.parking, (i) =>
      i.kind === "listing" ? yesNo(i.entity.amenities.includes("parking")) : null
    ),
    field(f.balconyTerrace, (i) =>
      i.kind === "listing"
        ? yesNo(i.entity.amenities.includes("balcony") || i.entity.amenities.includes("terrace"))
        : null
    ),
    field(f.furnished, (i) =>
      i.kind === "listing" ? yesNo(i.entity.amenities.includes("furnished")) : null
    ),
    field(f.neighborhood, (i) =>
      i.kind === "listing" ? getNeighborhood(i.entity.neighborhoodId)?.name ?? null : null
    ),
    field(f.publisher, (i) => (i.kind === "listing" ? i.entity.publisher.name : i.projectName)),
    field(f.availability, (i) =>
      i.kind === "listing" ? f.available : i.entity.status === "available" ? f.available : i.entity.status
    ),
  ];
}

export { AMENITY_LABELS };
