import type { Metadata } from "next";
import { HelpPageClient } from "@/components/help/HelpPageClient";

export const metadata: Metadata = {
  title: "Qendra e ndihmës",
  description: "Përgjigje rreth mënyrës si funksionon ROZARIS, zbulimi 3D dhe si të na kontaktoni.",
};

export default function HelpPage() {
  return <HelpPageClient />;
}
