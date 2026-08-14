import type { Metadata } from "next";
import { publishers } from "@/lib/mockData";
import { getProjectsByDeveloper } from "@/lib/projects.server";
import { getActiveListingsByPublisher } from "@/lib/listings.server";
import { DevelopersDirectoryClient } from "@/components/developers/DevelopersDirectoryClient";

export const metadata: Metadata = {
  title: "Zhvillues & agjenci të verifikuara",
  description: "Shfleto zhvilluesit dhe agjencitë e verifikuara të pasurive të paluajtshme në ROZARIS.",
};

export default async function DevelopersDirectoryPage() {
  // Publisher identity is still mockData (see developer/[slug]/page.tsx's
  // own note on why), but real project/listing counts per publisher —
  // same "Rozaris Platform Audit" Projects/Units migration as everywhere
  // else on this page's siblings.
  const publishersWithCounts = await Promise.all(
    publishers.map(async (p) => {
      const [projects, listings] = await Promise.all([
        getProjectsByDeveloper(p.id),
        getActiveListingsByPublisher(p.id),
      ]);
      return { publisher: p, projectCount: projects.length, listingCount: listings.length };
    })
  );

  return <DevelopersDirectoryClient publishers={publishersWithCounts} />;
}
