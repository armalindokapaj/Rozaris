import type { Metadata } from "next";
import { InteriorDesignPageClient } from "@/components/resources/InteriorDesignPageClient";

export const metadata: Metadata = {
  title: "Dizajn interior — Vega Interiors Studio",
  description: "Pse të zgjedhësh një studio dizajni interior, plus një vlerësues kostosh për projektin ose të gjithë njësinë.",
};

export default function InteriorDesignPage() {
  return <InteriorDesignPageClient />;
}
