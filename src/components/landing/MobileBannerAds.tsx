"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 3;

function AdSlotCard() {
  return (
    <div className="flex h-36 w-full shrink-0 snap-center flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-100/70 shadow-[0_8px_24px_rgba(17,24,39,0.06)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-200">
        <Megaphone className="h-4 w-4" />
      </span>
      <span className="text-[13px] font-bold text-neutral-500">Your AD can be put here</span>
    </div>
  );
}

/**
 * Placeholder sponsored-slot carousel — same seamless loop mechanics as
 * `MobilePromoBanner` (decoy-clone trick, scroll-settle snap-back), but
 * NOT that component's edge-to-edge "peek" card shape: each slot is
 * `w-full` and the track carries no `-mx-5` bleed, so it sits flush inside
 * the same `px-5` parent as the search card above it — same width, same
 * left/right edges, lines perfectly aligned, one ad fully visible at a
 * time rather than a sliver of the next/prev peeking in. 3 empty "Your AD
 * can be put here" slots, not wired to any ad system yet, same as the
 * sidebar `AdBanner` on the listing page — a fixed placement waiting for
 * real creative.
 *
 * Loop mechanics: identical decoy-clone trick as MobilePromoBanner — a
 * clone of the last slot is prepended and a clone of the first is
 * appended, so swiping past either end snaps (instantly, imperceptibly)
 * to the matching real slide on the opposite end instead of stopping dead.
 */
export function MobileBannerAds() {
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

  return (
    <div className="my-3.5">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: SLIDES }, (_, i) => (
          <AdSlotCard key={i} />
        ))}
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
