import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getListingBySlug, getNeighborhood, relatedListings, listings } from "@/lib/mockData";
import { formatPrice } from "@/lib/utils";
import { SITE_URL } from "@/lib/constants";
import { ListingDetailClient } from "./ListingDetailClient";

export function generateStaticParams() {
  return listings.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = getListingBySlug(slug);
  if (!listing) return {};
  const price = formatPrice(listing.price, listing.currency);
  return {
    title: `${listing.title} — ${price}`,
    description: `${listing.bedrooms} bed, ${listing.area} m² ${listing.propertyType} in ${listing.city}. ${listing.description.slice(0, 120)}`,
    openGraph: {
      title: `${listing.title} — ${price}`,
      description: listing.description.slice(0, 160),
    },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = getListingBySlug(slug);
  if (!listing) notFound();

  const related = relatedListings(listing);
  const neighborhood = getNeighborhood(listing.neighborhoodId);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: listing.title,
    description: listing.description,
    url: `${SITE_URL}/listing/${listing.slug}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.city,
      addressRegion: neighborhood?.name,
      addressCountry: "AL",
    },
    numberOfBedrooms: listing.bedrooms,
    numberOfBathroomsTotal: listing.bathrooms,
    floorSize: { "@type": "QuantitativeValue", value: listing.area, unitCode: "MTK" },
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: listing.currency,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListingDetailClient listing={listing} related={related} />
    </>
  );
}
