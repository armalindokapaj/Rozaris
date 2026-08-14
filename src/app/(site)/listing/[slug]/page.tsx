import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhood } from "@/lib/mockData";
import { getListingDetail, getAllListingSlugs } from "@/lib/listings.server";
import { formatPrice } from "@/lib/utils";
import { SITE_URL } from "@/lib/constants";
import { ListingDetailClient } from "./ListingDetailClient";

export async function generateStaticParams() {
  const slugs = await getAllListingSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getListingDetail(slug);
  if (!detail) return {};
  const { listing } = detail;
  const price = formatPrice(listing.price, listing.currency);
  return {
    title: `${listing.title} — ${price}`,
    description: `${listing.bedrooms} dhoma gjumi, ${listing.area} m² ${listing.propertyType} në ${listing.city}. ${listing.description.sq.slice(0, 120)}`,
    openGraph: {
      title: `${listing.title} — ${price}`,
      description: listing.description.sq.slice(0, 160),
    },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getListingDetail(slug);
  if (!detail) notFound();
  const { listing, related } = detail;

  const neighborhood = getNeighborhood(listing.neighborhoodId);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: listing.title,
    description: listing.description.sq,
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
