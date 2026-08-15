import type { Metadata } from "next";
import { getAllPublishers } from "@/lib/publishers.server";
import { getProjectsByDeveloper } from "@/lib/projects.server";
import { getActiveListingsByPublisher } from "@/lib/listings.server";
import { DevelopersDirectoryClient } from "@/components/developers/DevelopersDirectoryClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("developers");
}

export default async function DevelopersDirectoryPage() {
  // Real Postgres `Publisher` rows (any real signed-up, admin-verified
  // publisher now appears here too — was hardcoded `mockData.publishers`,
  // see the launch-readiness audit that found this), with real
  // project/listing counts per publisher.
  const publishers = await getAllPublishers();
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
