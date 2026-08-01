import type { Metadata } from "next";
import { publishers, projectsByDeveloper, listingsByPublisher } from "@/lib/mockData";
import { DevelopersDirectoryClient } from "@/components/developers/DevelopersDirectoryClient";

export const metadata: Metadata = {
  title: "Zhvillues & agjenci të verifikuara",
  description: "Shfleto zhvilluesit dhe agjencitë e verifikuara të pasurive të paluajtshme në ROZARIS.",
};

export default function DevelopersDirectoryPage() {
  const publishersWithCounts = publishers.map((p) => ({
    publisher: p,
    projectCount: projectsByDeveloper(p.id).length,
    listingCount: listingsByPublisher(p.id).length,
  }));

  return <DevelopersDirectoryClient publishers={publishersWithCounts} />;
}
