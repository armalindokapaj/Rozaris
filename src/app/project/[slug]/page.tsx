import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllProjectSlugs, getProjectBySlug } from "@/lib/projects.server";
import { SITE_URL } from "@/lib/constants";
import { MarketplaceViewer } from "./MarketplaceViewer";
import { CustomProjectPreview } from "./CustomProjectPreview";

export async function generateStaticParams() {
  const slugs = await getAllProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return {};
  return {
    title: `${project.name} — ArchViz | ${project.developer.name}`,
    description: `Eksploro ${project.name} nga ${project.developer.name} në 3D interaktiv. ${project.availableUnits} njësi të disponueshme.`,
  };
}

export default async function ProjectArchVizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) {
    // Not (yet) a published Postgres project — could still be a
    // freshly admin-created one this server render's cache hasn't caught
    // up with yet, or one still sitting in Zustand `customProjects` from
    // an older session (MVP admin pipe, see
    // "rozaris-mvp-admin-project-pipe" memory). Hand off to a client
    // component that checks there instead of 404ing outright.
    return <CustomProjectPreview slug={slug} />;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: project.name,
    url: `${SITE_URL}/project/${project.slug}`,
    description: project.description.sq,
    numberOfAccommodationUnits: project.totalUnits,
    developer: { "@type": "Organization", name: project.developer.name },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Server-rendered, always-crawlable content — PRJ-010 / SEO-002 / ARC-004:
          real text exists even if the client 3D viewer or WebGL never loads. */}
      <noscript>
        <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
          <h1>{project.name}</h1>
          <p>Nga {project.developer.name}</p>
          <p>{project.description.sq}</p>
          <p>
            {project.availableUnits} nga {project.totalUnits} njësi të disponueshme ·{" "}
            {project.completionLabel}
          </p>
          <h2>Njësitë</h2>
          <ul>
            {project.units.map((u) => (
              <li key={u.id}>
                {u.code} — {u.bedrooms} dhoma gjumi, {u.area} m² — {u.currency === "EUR" ? "€" : "L"}
                {u.price.toLocaleString()} (
                {u.status === "available" ? "e disponueshme" : u.status === "reserved" ? "e rezervuar" : "e shitur"})
              </li>
            ))}
          </ul>
        </main>
      </noscript>
      {/* Suspense boundary for useSearchParams() (shadow-map debug HUD's
          ?debugShadowMap=1 query param) so this route can still prerender
          statically — same precedent as rent-vs-buy/page.tsx. */}
      <Suspense fallback={null}>
        <MarketplaceViewer project={project} />
      </Suspense>
    </>
  );
}
