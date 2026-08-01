import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { publishers, projectsByDeveloper, listingsByPublisher } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

export const metadata: Metadata = {
  title: "Verified developers & agencies",
  description: "Browse verified real-estate developers and agencies on ROZARIS.",
};

const TYPE_LABEL: Record<string, string> = {
  private_owner: "Private Owner",
  agency: "Agency",
  developer: "Developer",
};

export default function DevelopersDirectoryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="text-2xl font-bold text-neutral-900">Find agents & developers</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Verified publishers with quality-controlled inventory across Tirana.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {publishers.map((p) => {
          const projectCount = projectsByDeveloper(p.id).length;
          const listingCount = listingsByPublisher(p.id).length;
          return (
            <Link
              key={p.id}
              href={`/developer/${p.slug}`}
              className="flex items-center gap-3 rounded-panel border border-neutral-200 bg-white p-4 hover:border-neutral-300 hover:shadow-sm"
            >
              <PlaceholderImage
                seed={p.id}
                kind="avatar"
                className="h-12 w-12 shrink-0 rounded-2xl"
                iconClassName="h-5 w-5"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
                  {p.name}
                  {p.verified && <BadgeCheck className="h-4 w-4 text-brand-500" />}
                </p>
                <p className="text-xs text-neutral-500">{TYPE_LABEL[p.type]}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {projectCount > 0 && `${projectCount} projects · `}
                  {listingCount} listings
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
