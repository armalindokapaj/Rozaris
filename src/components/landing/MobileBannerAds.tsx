"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrackEvent } from "@/hooks/useTrackEvent";

const SLOT_COUNT = 3;

interface Ad {
  id: string;
  position: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
}

function EmptySlotCard() {
  return (
    <div className="flex h-36 w-full shrink-0 snap-center flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-100/70 shadow-[0_8px_24px_rgba(17,24,39,0.06)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-200">
        <Megaphone className="h-4 w-4" />
      </span>
      <span className="text-[13px] font-bold text-neutral-500">Your AD can be put here</span>
    </div>
  );
}

function AdSlotCard({ ad, onTrack }: { ad: Ad; onTrack: (kind: "impression" | "click") => void }) {
  return (
    <a
      href={ad.linkUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => onTrack("click")}
      className="relative h-36 w-full shrink-0 snap-center overflow-hidden rounded-2xl bg-neutral-100 shadow-[0_8px_24px_rgba(17,24,39,0.06)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded Blob URL, no next/image domain config to trust */}
      <img src={ad.imageUrl} alt={ad.title} className="h-full w-full object-cover" />
      <span className="absolute right-2 top-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
        Ad
      </span>
    </a>
  );
}

/**
 * Real admin-managed banner carousel — up to 3 slots for the given
 * placement (`category`/`device`, see the admin ads route's position
 * scheme), each either a real admin-uploaded photo + destination link or,
 * if that slot isn't filled/enabled, the original "Your AD can be put
 * here" placeholder card. Reconciles what used to be two separate,
 * unwired ad concepts on this page (see the "Rozaris landing page PRD"
 * memory) into one real system with the same seamless decoy-clone loop
 * (a clone of the last slot prepended, a clone of the first appended,
 * scroll-settle snap-back to the matching real slide) regardless of
 * whether a given slide is real creative or the empty-slot placeholder.
 * Impression fires once per real ad on mount; click fires before
 * navigating away.
 */
export function MobileBannerAds({ category = "front_page" }: { category?: "front_page" | "search_page" }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const track = useTrackEvent();

  useEffect(() => {
    fetch(`/api/ads?category=${category}&device=mobile`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Ad[]) => setAds(rows))
      .catch(() => {});
  }, [category]);

  useEffect(() => {
    ads.forEach((ad) => track("ad", ad.id, "impression"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  const slides = Array.from({ length: SLOT_COUNT }, (_, i) => ads.find((ad) => ad.position.endsWith(`_banner_${i + 1}`)) ?? null);

  const SLIDES = SLOT_COUNT + 2; // 1 decoy on each end + SLOT_COUNT real slots

  // Start on the first real slide (index 1 once decoys are prepended), no
  // smooth scrolling so there's nothing to see before first paint.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / SLIDES;
    el.scrollLeft = cardWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / SLIDES;
    const rawIndex = Math.round(el.scrollLeft / cardWidth);

    setActive(((rawIndex - 1) % SLOT_COUNT + SLOT_COUNT) % SLOT_COUNT);

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (rawIndex === 0) {
        el.scrollLeft = cardWidth * SLOT_COUNT; // land on the real last slot
      } else if (rawIndex === SLIDES - 1) {
        el.scrollLeft = cardWidth; // land on the real first slot
      }
    }, 120);
  };

  const renderSlide = (i: number, key: string) => {
    const ad = slides[i];
    return ad ? <AdSlotCard key={key} ad={ad} onTrack={(kind) => track("ad", ad.id, kind)} /> : <EmptySlotCard key={key} />;
  };

  return (
    <div className="my-3.5">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {renderSlide(SLOT_COUNT - 1, "decoy-start")}
        {slides.map((_, i) => renderSlide(i, `real-${i}`))}
        {renderSlide(0, "decoy-end")}
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200 ease-[var(--ease-rz)]",
              i === active ? "w-4 bg-brand-600" : "w-1.5 bg-neutral-300"
            )}
          />
        ))}
      </div>
    </div>
  );
}
