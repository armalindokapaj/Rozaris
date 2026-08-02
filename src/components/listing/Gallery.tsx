"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

type Tab = "photos" | "floorplan" | "facade" | "video";

export function Gallery({
  seedBase,
  photoCount = 5,
  hasFacade = true,
  hasVideo = false,
}: {
  seedBase: string;
  photoCount?: number;
  /** Facade / unit-location media is only shown if the publisher uploaded it. */
  hasFacade?: boolean;
  /** Video tour is only shown if the publisher uploaded one. */
  hasVideo?: boolean;
}) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("photos");
  const [index, setIndex] = useState(0);

  const photoSeeds = Array.from({ length: photoCount }, (_, i) => `${seedBase}-photo-${i}`);

  const tabs: { key: Tab; label: string }[] = [
    { key: "photos", label: t("gallery.tabPhotos") },
    { key: "floorplan", label: t("gallery.tabFloorplan") },
    ...(hasFacade ? [{ key: "facade" as const, label: t("gallery.tabFacade") }] : []),
    ...(hasVideo ? [{ key: "video" as const, label: t("gallery.tabVideo") }] : []),
  ];

  return (
    <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
      <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
        {tab === "photos" && (
          <>
            <PlaceholderImage
              seed={photoSeeds[index]}
              kind="interior"
              className="h-full w-full"
              iconClassName="h-10 w-10"
              watermark
            />
            {photoCount > 1 && (
              <>
                <button
                  onClick={() => setIndex((i) => (i - 1 + photoCount) % photoCount)}
                  aria-label={t("gallery.prevPhoto")}
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow"
                >
                  <ChevronLeft className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => setIndex((i) => (i + 1) % photoCount)}
                  aria-label={t("gallery.nextPhoto")}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow"
                >
                  <ChevronRight className="h-4.5 w-4.5" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {photoSeeds.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setIndex(i)}
                      aria-label={t("gallery.goToPhoto", { n: i + 1 })}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === index ? "w-5 bg-white" : "w-1.5 bg-white/60"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {tab === "floorplan" && (
          <PlaceholderImage
            seed={`${seedBase}-floorplan`}
            kind="floorplan"
            className="h-full w-full"
            iconClassName="h-10 w-10"
          />
        )}
        {tab === "facade" && (
          <PlaceholderImage
            seed={`${seedBase}-facade`}
            kind="facade"
            className="h-full w-full"
            iconClassName="h-10 w-10"
            watermark
          />
        )}
        {tab === "video" && (
          <button
            type="button"
            aria-label={t("gallery.playVideo")}
            className="group h-full w-full cursor-pointer"
          >
            <PlaceholderImage
              seed={`${seedBase}-video`}
              kind="video"
              className="h-full w-full"
              iconClassName="h-14 w-14 transition-transform group-hover:scale-110"
            />
          </button>
        )}
      </div>
      <div className="flex gap-1 border-t border-neutral-100 p-2">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "rounded-control px-3.5 py-2 text-xs font-semibold transition-colors",
              tab === key
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:bg-neutral-100"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
