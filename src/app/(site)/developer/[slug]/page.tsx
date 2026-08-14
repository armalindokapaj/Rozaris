import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublisherBySlug, publishers } from "@/lib/mockData";
import { getProjectsByDeveloper } from "@/lib/projects.server";
import { getActiveListingsByPublisher } from "@/lib/listings.server";
import { SITE_URL } from "@/lib/constants";
import { DeveloperProfileClient } from "@/components/developers/DeveloperProfileClient";

export function generateStaticParams() {
  return publishers.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const publisher = getPublisherBySlug(slug);
  if (!publisher) return {};
  return {
    title: publisher.name,
    description: publisher.bio ?? `${publisher.name} në ROZARIS.`,
  };
}

export default async function DeveloperPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const publisher = getPublisherBySlug(slug);
  if (!publisher) notFound();

  // Publisher identity itself is still mockData (see the "Rozaris Platform
  // Audit" memory — Publishers weren't part of this or the T0 migration),
  // but its ids are 1:1 with the real Postgres rows `prisma/seed.ts` seeds
  // from the same mockData, so looking up real projects/listings by
  // `publisher.id` is correct today regardless.
  const [projects, listings] = await Promise.all([
    getProjectsByDeveloper(publisher.id),
    getActiveListingsByPublisher(publisher.id),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: publisher.name,
    url: `${SITE_URL}/developer/${publisher.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DeveloperProfileClient publisher={publisher} projects={projects} listings={listings} />
    </>
  );
}
