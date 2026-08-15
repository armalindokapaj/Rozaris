import type { Metadata } from "next";
import { InteriorDesignPageClient } from "@/components/resources/InteriorDesignPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("interiorDesign");
}

export default function InteriorDesignPage() {
  return <InteriorDesignPageClient />;
}
