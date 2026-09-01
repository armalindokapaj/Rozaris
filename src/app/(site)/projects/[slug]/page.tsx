import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProjectSlugs, getProjectBySlug, getRelatedProjects } from "@/lib/projects.server";
import { SITE_URL } from "@/lib/constants";
import { ProjectDetailClient } from "@/components/project/ProjectDetailClient";

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
  const fromPrice = project.units.length
    ? Math.min(...project.units.map((u) => u.price))
    : null;
  const description = `${project.name} by ${project.developer.name} in ${project.city}. ${
    project.availableUnits
  } of ${project.totalUnits} units available${
    fromPrice != null ? `, from €${fromPrice.toLocaleString()}` : ""
  }. ${project.description.en}`.slice(0, 300);
  return {
    title: `${project.name} | ROZARIS`,
    description,
    alternates: { canonical: `${SITE_URL}/projects/${project.slug}` },
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const related = await getRelatedProjects(project);
  const fromPrice = project.units.length
    ? Math.min(...project.units.map((u) => u.price))
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: project.name,
    url: `${SITE_URL}/projects/${project.slug}`,
    description: project.description.en,
    numberOfAccommodationUnits: project.totalUnits,
    developer: { "@type": "Organization", name: project.developer.name },
    ...(fromPrice != null
      ? {
          offers: {
            "@type": "AggregateOffer",
            lowPrice: fromPrice,
            priceCurrency: "EUR",
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {                                                               
                                                                            }
      <noscript>
        <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
          <h1>{project.name}</h1>
          <p>by {project.developer.name}</p>
          <p>{project.description.en}</p>
          <p>
            {project.availableUnits} of {project.totalUnits} units available ·{" "}
            {project.completionLabel}
            {fromPrice != null ? ` · From €${fromPrice.toLocaleString()}` : ""}
          </p>
          <h2>Units</h2>
          <ul>
            {project.units.map((u) => (
              <li key={u.id}>
                {u.code} — {u.bedrooms} bed, {u.area} m² — €{u.price.toLocaleString()} ({u.status})
              </li>
            ))}
          </ul>
        </main>
      </noscript>
      <ProjectDetailClient project={project} related={related} />
    </>
  );
}
