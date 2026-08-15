import type { Metadata } from "next";
import { RedoUnitDesignPageClient } from "@/components/resources/RedoUnitDesignPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("redoUnitDesign");
}

export default function RedoUnitDesignPage() {
  return <RedoUnitDesignPageClient />;
}
