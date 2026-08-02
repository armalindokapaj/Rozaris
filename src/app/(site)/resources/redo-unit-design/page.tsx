import type { Metadata } from "next";
import { RedoUnitDesignPageClient } from "@/components/resources/RedoUnitDesignPageClient";

export const metadata: Metadata = {
  title: "Rikrijo dizajnin e njësisë — Vega Interiors Studio",
  description: "Vlerësues kostosh sipas llojit dhe sipërfaqes së njësisë, plus zgjedhje e hapësirave për rikonstruksion.",
};

export default function RedoUnitDesignPage() {
  return <RedoUnitDesignPageClient />;
}
