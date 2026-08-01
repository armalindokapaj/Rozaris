import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, MessageCircle, Phone } from "lucide-react";
import {
  getPublisherBySlug,
  listingsByPublisher,
  projectsByDeveloper,
  publishers,
} from "@/lib/mockData";
import { SITE_URL } from "@/lib/constants";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { ListingCard } from "@/components/results/ListingCard";
import { ProjectCard } from "@/components/results/ProjectCard";
import { telHref, whatsappHref } from "@/lib/utils";
import sq from "@/lib/i18n/sq";

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

const TYPE_LABEL: Record<string, string> = {
  private_owner: sq.publisher.typePrivateOwner,
  agency: sq.publisher.typeAgency,
  developer: sq.publisher.typeDeveloper,
};

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
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex flex-col items-start gap-6 rounded-panel border border-neutral-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PlaceholderImage
            seed={publisher.id}
            kind="avatar"
            className="h-16 w-16 shrink-0 rounded-2xl"
            iconClassName="h-7 w-7"
          />
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
              {publisher.name}
              {publisher.verified && <BadgeCheck className="h-5 w-5 text-brand-500" />}
            </h1>
            <p className="text-sm text-neutral-500">{TYPE_LABEL[publisher.type]}</p>
            {publisher.bio && (
              <p className="mt-2 max-w-xl text-sm text-neutral-600">{publisher.bio}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={whatsappHref(publisher.whatsapp, `Përshëndetje ${publisher.name}, ju gjeta në ROZARIS`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-control bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" /> {sq.publisher.whatsapp}
          </a>
          <a
            href={telHref(publisher.phone)}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700"
          >
            <Phone className="h-4 w-4" /> {sq.publisher.call}
          </a>
        </div>
      </div>

      {projects.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-neutral-900">
            Projekte ({projects.length})
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}

      {listings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold text-neutral-900">
            Listime aktive ({listings.length})
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} variant="grid" />
            ))}
          </div>
        </section>
      )}

      {projects.length === 0 && listings.length === 0 && (
        <p className="mt-8 text-sm text-neutral-500">Ende pa inventar publik.</p>
      )}
    </div>
  );
}
