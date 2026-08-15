import type { Metadata } from "next";
import { AboutPageClient } from "@/components/about/AboutPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("about");
}

export default function AboutPage() {
  return <AboutPageClient />;
}
