import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPublisherBySlug,
  listingsByPublisher,
  projectsByDeveloper,
  publishers,
} from "@/lib/mockData";
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

  const projects = projectsByDeveloper(publisher.id);
  const listings = listingsByPublisher(publisher.id);

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
