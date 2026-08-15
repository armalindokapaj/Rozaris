import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPublishers, getPublisherBySlug } from "@/lib/publishers.server";
import { getProjectsByDeveloper } from "@/lib/projects.server";
import { getActiveListingsByPublisher } from "@/lib/listings.server";
import { SITE_URL } from "@/lib/constants";
import { DeveloperProfileClient } from "@/components/developers/DeveloperProfileClient";

export async function generateStaticParams() {
  const publishers = await getAllPublishers();
  return publishers.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const publisher = await getPublisherBySlug(slug);
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
  // Real Postgres `Publisher` row — was hardcoded `mockData.publishers`,
  // meaning a real signed-up, admin-verified developer could never get a
  // profile page here. See the launch-readiness audit that found this.
  const publisher = await getPublisherBySlug(slug);
  if (!publisher) notFound();

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
