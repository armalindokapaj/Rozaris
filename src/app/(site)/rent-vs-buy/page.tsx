import type { Metadata } from "next";
import { Suspense } from "react";
import { RentVsBuyClient } from "@/components/tools/RentVsBuyClient";

// PRD_Rent_vs_Buy.pdf §18: indexable public route, unique title/description.
export const metadata: Metadata = {
  title: "Rent vs Buy",
  description:
    "Compare the true long-term cost of renting versus buying in Tirana. A transparent, assumption-driven calculator — not financial advice.",
};

export default function RentVsBuyPage() {
  return (
    // useSearchParams() (for the listing-price prefill) requires a
    // Suspense boundary for this route to still prerender statically.
    <Suspense fallback={null}>
      <RentVsBuyClient />
    </Suspense>
  );
}
