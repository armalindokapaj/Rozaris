import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { getAllProjectSlugs, getProjectBySlug } from "@/lib/projects.server";
import { SITE_URL } from "@/lib/constants";
import { MarketplaceViewer } from "./MarketplaceViewer";
import { CustomProjectPreview } from "./CustomProjectPreview";

/**
 * Turns on `viewport-fit=cover`, which is what makes every
 * `env(safe-area-inset-*)` in the viewer actually resolve to a real
 * number on a notched device. Next injects
 * `width=device-width, initial-scale=1` by default and nothing in this
 * app overrode it, so on iOS every one of those insets evaluated to
 * `0px`: the HUD header's `pt-[max(0.75rem,env(safe-area-inset-top))]`
 * (ViewerHUD.tsx), the dock's own
 * `bottom-[max(0.75rem,env(safe-area-inset-bottom))]`, the unit card's
 * offsets and MapViewToggle's insets were all silently pinned to their
 * 12px floors — i.e. the dock sat under the home indicator and the
 * identity plate under the status bar, on exactly the devices the
 * expressions were written for.
 *
 * Scoped to this route (and the `/embed` one) rather than the root
 * layout on purpose: `viewport-fit=cover` changes how the whole document
 * meets the screen edge, and the marketing/search pages have not been
 * audited for it. The viewer is the one surface here that is already
 * written edge-to-edge with real safe-area expressions throughout.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
