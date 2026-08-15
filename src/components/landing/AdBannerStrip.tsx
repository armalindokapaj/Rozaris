"use client";

import { useEffect, useState } from "react";
import { useTrackEvent } from "@/hooks/useTrackEvent";

interface Ad {
  id: string;
  position: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
}

/** Real admin-managed front-page banners (see the "Rozaris Platform Audit"
 * memory's Advertising feature) — up to 3 fixed slots, each a real image +
 * destination link an admin sets from the console. Renders nothing if no
 * slot is enabled, rather than an empty placeholder strip. Impression
 * fires once per banner on mount; click fires on click, before navigating. */
export function AdBannerStrip() {
  const [ads, setAds] = useState<Ad[]>([]);
  const track = useTrackEvent();

  useEffect(() => {
    fetch("/api/ads")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Ad[]) => setAds(rows))
      .catch(() => {});
  }, []);

  useEffect(() => {
    ads.forEach((ad) => track("ad", ad.id, "impression"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  if (ads.length === 0) return null;

  return (
    <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ads.map((ad) => (
        <a
          key={ad.id}
          href={ad.linkUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => track("ad", ad.id, "click")}
          className="relative h-24 w-[92%] shrink-0 snap-center overflow-hidden rounded-2xl bg-neutral-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL, no next/image domain config to trust */}
          <img src={ad.imageUrl} alt={ad.title} className="h-full w-full object-cover" />
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Ad
          </span>
        </a>
      ))}
    </div>
  );
}
