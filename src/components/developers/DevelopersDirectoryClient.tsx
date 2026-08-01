"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useT } from "@/lib/i18n/useT";
import type { Publisher } from "@/lib/types";

type PublisherWithCounts = {
  publisher: Publisher;
  projectCount: number;
  listingCount: number;
};

const TYPE_LABEL_KEY: Record<Publisher["type"], string> = {
  private_owner: "publisher.typePrivateOwner",
  agency: "publisher.typeAgency",
  developer: "publisher.typeDeveloper",
};

export function DevelopersDirectoryClient({ publishers }: { publishers: PublisherWithCounts[] }) {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="text-2xl font-bold text-neutral-900">{t("developersPage.title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("developersPage.subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {publishers.map(({ publisher: p, projectCount, listingCount }) => (
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
              <p className="text-xs text-neutral-500">{t(TYPE_LABEL_KEY[p.type])}</p>
              <p className="mt-0.5 text-xs text-neutral-400">
                {projectCount > 0 && `${t("developersPage.projectsCount", { count: projectCount })} · `}
                {t("developersPage.listingsCount", { count: listingCount })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
