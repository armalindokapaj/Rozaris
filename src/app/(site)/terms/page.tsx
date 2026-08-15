import type { Metadata } from "next";
import { LegalPageClient } from "@/components/legal/LegalPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("terms");
}

export default function TermsPage() {
  return <LegalPageClient topicKey="termsPage" sectionCount={16} />;
}
