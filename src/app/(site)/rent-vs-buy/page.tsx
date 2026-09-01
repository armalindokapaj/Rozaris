import type { Metadata } from "next";
import { Suspense } from "react";
import { RentVsBuyClient } from "@/components/tools/RentVsBuyClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("rentVsBuy");
}

export default function RentVsBuyPage() {
  return (
    <Suspense fallback={null}>
      <RentVsBuyClient />
    </Suspense>
  );
}
