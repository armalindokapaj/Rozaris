import type { Metadata } from "next";
import { Box, Mail, MessageCircle, Rotate3d, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Help center",
  description: "Answers about how ROZARIS works, 3D discovery, and getting in touch.",
};

const FAQS = [
  {
    q: "How does the 3D map work?",
    a: "ROZARIS renders Tirana as a real 3D city. Drag to rotate, scroll or pinch to zoom, and tilt to see buildings from an angle. As you zoom in, neighborhoods reveal individual buildings, listings and new-development projects.",
  },
  {
    q: "What is Explore in 3D?",
    a: "New developments show a lightweight 3D model on the main map. Tapping a project opens a dedicated ArchViz viewer in a new tab with the full exterior model, live unit availability and construction progress.",
  },
  {
    q: "Why can I only compare two properties?",
    a: "Comparison is intentionally limited to two items to keep the experience focused and preserve your map context.",
  },
  {
    q: "How do I contact a publisher?",
    a: "Every listing and project exposes WhatsApp and phone actions. ROZARIS does not read the contents of external conversations.",
  },
  {
    q: "How are listings verified?",
    a: "Every listing and publisher-submitted update requires Admin approval before it becomes public, and each listing has exactly one publisher to avoid duplicates.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <h1 className="text-2xl font-bold text-neutral-900">Help center</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Answers about how ROZARIS works. Can&apos;t find what you need? Reach out below.
      </p>

      <section id="3d-map" className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Rotate3d className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-neutral-900">Explore Property in 3D</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          ROZARIS is a 3D-first discovery platform — the map is the primary way to browse,
          not a secondary widget beside a list. New developments additionally open a
          dedicated ArchViz viewer with real-time availability and construction progress,
          which developers can also license as an embeddable digital twin for their own
          websites.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-card border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">
              {f.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.a}</p>
          </details>
        ))}
      </section>

      <section id="about" className="mt-10 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-neutral-900">About ROZARIS</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          ROZARIS enables people to discover, evaluate and contact real-estate opportunities
          through a fast, elegant and spatially accurate 3D environment — launching first in
          Tirana, Albania, with architecture ready to expand across the Balkans and wider
          Europe.
        </p>
      </section>

      <section id="contact" className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold text-neutral-900">Contact</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <a href="mailto:hello@rozaris.al" className="flex items-center gap-2 text-neutral-600 hover:text-brand-600">
            <Mail className="h-4 w-4" /> hello@rozaris.al
          </a>
          <a
            href="https://wa.me/355691234567"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-neutral-600 hover:text-brand-600"
          >
            <MessageCircle className="h-4 w-4" /> Chat with support on WhatsApp
          </a>
        </div>
      </section>

      <p className="mt-8 flex items-center gap-1.5 text-xs text-neutral-400">
        <Box className="h-3.5 w-3.5" />
        This is a product prototype — content and inventory shown are illustrative.
      </p>
    </div>
  );
}
