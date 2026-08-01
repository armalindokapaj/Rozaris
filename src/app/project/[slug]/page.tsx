import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectBySlug, projects } from "@/lib/mockData";
import { SITE_URL } from "@/lib/constants";
import { ArchVizClient } from "./ArchVizClient";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
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
  const project = getProjectBySlug(slug);
  if (!project) notFound();

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
      <ArchVizClient project={project} />
    </>
  );
}
