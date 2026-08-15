import type { Metadata } from "next";
import { HelpPageClient } from "@/components/help/HelpPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("help");
}

export default function HelpPage() {
  return <HelpPageClient />;
}
