import type { Metadata } from "next";
import { Suspense } from "react";
import { RentVsBuyClient } from "@/components/tools/RentVsBuyClient";
import { getPageSeo } from "@/lib/pageSeo";

// PRD_Rent_vs_Buy.pdf §18: indexable public route, unique title/description.
export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("rentVsBuy");
}

export default function RentVsBuyPage() {
  return (
    // useSearchParams() (for the listing-price prefill) requires a
    // Suspense boundary for this route to still prerender statically.
    <Suspense fallback={null}>
      <RentVsBuyClient />
    </Suspense>
  );
}
