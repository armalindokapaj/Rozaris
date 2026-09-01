"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
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
    <div className="flex h-full w-full shrink-0 snap-center flex-col items-center justify-center gap-2 overflow-hidden border-2 border-dashed border-neutral-300 bg-neutral-100/70 shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-200">
        <Megaphone className="h-5 w-5" />
      </span>
      <span className="text-base font-bold text-neutral-500">Your AD can be put here</span>
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
      className="relative h-full w-full shrink-0 snap-center overflow-hidden bg-neutral-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded Blob URL, no next/image domain config to trust */}
      <img src={ad.imageUrl} alt={ad.title} className="h-full w-full object-cover" />
      <span className="absolute right-3 top-3 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Ad
      </span>
    </a>
  );
}

export function DesktopBannerAds({ category = "front_page" }: { category?: "front_page" | "search_page" }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const track = useTrackEvent();

  useEffect(() => {
    fetch(`/api/ads?category=${category}&device=desktop`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Ad[]) => setAds(rows))
      .catch(() => {});
  }, [category]);

  useEffect(() => {
    ads.forEach((ad) => track("ad", ad.id, "impression"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads]);

  const slides = Array.from({ length: SLOT_COUNT }, (_, i) => ads.find((ad) => ad.position.endsWith(`_banner_${i + 1}`)) ?? null);

  const SLIDES = SLOT_COUNT + 2;

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
        el.scrollLeft = cardWidth * SLOT_COUNT;
      } else if (rawIndex === SLIDES - 1) {
        el.scrollLeft = cardWidth;
      }
    }, 120);
  };

  const goTo = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / SLIDES;
    el.scrollTo({ left: el.scrollLeft + direction * cardWidth, behavior: "smooth" });
  };

  const renderSlide = (i: number, key: string) => {
    const ad = slides[i];
    return ad ? <AdSlotCard key={key} ad={ad} onTrack={(kind) => track("ad", ad.id, kind)} /> : <EmptySlotCard key={key} />;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {renderSlide(SLOT_COUNT - 1, "decoy-start")}
          {slides.map((_, i) => renderSlide(i, `real-${i}`))}
          {renderSlide(0, "decoy-end")}
        </div>

        <button
          type="button"
          onClick={() => goTo(-1)}
          aria-label="Previous ad"
          className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-500 shadow-[var(--shadow-2)] transition-colors duration-150 hover:text-brand-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goTo(1)}
          aria-label="Next ad"
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-500 shadow-[var(--shadow-2)] transition-colors duration-150 hover:text-brand-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-center gap-1.5" aria-hidden="true">
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
