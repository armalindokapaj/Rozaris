import type { Metadata } from "next";
import { LegalPageClient } from "@/components/legal/LegalPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("privacy");
}

export default function PrivacyPage() {
  return <LegalPageClient topicKey="privacyPage" sectionCount={15} />;
}
