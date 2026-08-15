"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 3;

function AdSlotCard() {
  return (
    <div className="flex h-full w-full shrink-0 snap-center flex-col items-center justify-center gap-2 overflow-hidden border-2 border-dashed border-neutral-300 bg-neutral-100/70 shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-200">
        <Megaphone className="h-5 w-5" />
      </span>
      <span className="text-base font-bold text-neutral-500">Your AD can be put here</span>
    </div>
  );
}

/**
 * Desktop mirror of `MobileBannerAds`, filling the hero's right column
 * opposite `LandingSearchCard` on the left (see `LandingHero.tsx`) — same
 * seamless decoy-clone loop (a clone of the last slot prepended, a clone
 * of the first appended, scroll-settle snap-back to the matching real
 * slide), same "Your AD can be put here" placeholder slots, same idea,
 * just resized and restyled for this slot instead of copy-pasted verbatim:
 * `h-full`/`w-full` so top, bottom, left, and right all line up with the
 * search-card block opposite it (that grid row is `items-stretch`, sized
 * off the left column's natural content height, so this stretches to
 * match exactly rather than floating at its own intrinsic size); square
 * corners, not mobile's `rounded-2xl`, to match the desktop search card's
 * own un-rounded `border-neutral-200` aesthetic.
 *
 * Adds prev/next arrow buttons that mobile's version doesn't need — a
 * mouse can't swipe a snap-scroll track the way a touchscreen can, so
 * without them this loop would be effectively unreachable on desktop.
 */
export function DesktopBannerAds() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const goTo = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / SLIDES;
    el.scrollTo({ left: el.scrollLeft + direction * cardWidth, behavior: "smooth" });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {Array.from({ length: SLIDES }, (_, i) => (
            <AdSlotCard key={i} />
          ))}
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
