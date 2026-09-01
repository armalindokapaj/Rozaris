"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { MarketplaceViewer } from "./MarketplaceViewer";

export function CustomProjectPreview({ slug }: { slug: string }) {
  const project = useAppStore((s) => s.customProjects.find((p) => p.slug === slug));
  const { t } = useT();

  if (!project) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 text-center">
        <p className="text-sm text-neutral-500">{t("admin.projectNotFound")}</p>
      </main>
    );
  }

  return <MarketplaceViewer project={project} />;
}
