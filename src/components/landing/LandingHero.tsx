"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { JoinMenu } from "@/components/layout/JoinMenu";

// PRD_ROZARIS_Landing.pdf v1.0 (10 Aug 2026) — see the
// rozaris-landing-page-prd memory. This IS the landing page: a single
// pinned, scroll-scrubbed zoom through 20 supplied Tirana map frames
// (close city -> regional context), with only "ROZARIS" and "Sign In" as
// fixed, text-only, difference-blended chrome. No nav bar, no other
// sections — explicitly out of scope per the PRD.

const FRAME_COUNT = 20;
const FRAMES = Array.from(
  { length: FRAME_COUNT },
  (_, i) => `/landing/frame-${String(i + 1).padStart(2, "0")}.webp`
);

// Reference timing table (PRD §04) — piecewise, not a flat 0-100% -> frame
// 1-20 lerp, so the hold/zoom/reveal/exit pacing actually matches the spec
// instead of feeling uniformly linear. Frame indices are 0-based (frame 01
// = index 0).
const PHASES: { scrollEnd: number; scrollStart: number; frameStart: number; frameEnd: number }[] = [
  { scrollStart: 0, scrollEnd: 0.08, frameStart: 0, frameEnd: 0 }, // hold on frame 1
  { scrollStart: 0.08, scrollEnd: 0.58, frameStart: 1, frameEnd: 10 }, // frames 02-11
  { scrollStart: 0.58, scrollEnd: 0.88, frameStart: 11, frameEnd: 17 }, // frames 12-18
  { scrollStart: 0.88, scrollEnd: 1, frameStart: 18, frameEnd: 19 }, // frames 19-20
];

function progressToFrame(p: number): number {
  const phase = PHASES.find((ph) => p <= ph.scrollEnd) ?? PHASES[PHASES.length - 1];
  const span = phase.scrollEnd - phase.scrollStart;
  const local = span > 0 ? (p - phase.scrollStart) / span : 0;
  return phase.frameStart + (phase.frameEnd - phase.frameStart) * Math.min(1, Math.max(0, local));
}

export function LandingHero() {
  const trackRef = useRef<HTMLDivElement>(null);
  const layerARef = useRef<HTMLImageElement>(null);
  const layerBRef = useRef<HTMLImageElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [imagesFailed, setImagesFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability only known client-side
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Warm the browser cache for all 20 frames — hero + next 2 eagerly, the
  // rest during idle time (PRD §07 preload strategy) — so the scroll
  // handler's imperative `src` swaps below never block on network.
  useEffect(() => {
    if (reducedMotion) return;
    FRAMES.slice(0, 3).forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const schedule = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    schedule(() => {
      FRAMES.slice(3).forEach((src) => {
        const img = new window.Image();
        img.src = src;
      });
    });
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const track = trackRef.current;
    const a = layerARef.current;
    const b = layerBRef.current;
    if (!track || !a || !b) return;

    let raf = 0;

    function update() {
      raf = 0;
      const rect = track!.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      const frameFloat = progressToFrame(progress);

      // Hold phase (0-8%): frame 1 alone with a subtle self-scale — the
      // PRD's own explicit exception to the crossfade rule below.
      if (progress <= 0.08) {
        a!.src = FRAMES[0];
        a!.style.opacity = "1";
        a!.style.transform = `scale(${1 + 0.02 * (progress / 0.08)})`;
        b!.style.opacity = "0";
        return;
      }

      const base = Math.min(FRAME_COUNT - 1, Math.floor(frameFloat));
      const next = Math.min(FRAME_COUNT - 1, base + 1);
      const frac = frameFloat - base;

      a!.src = FRAMES[base];
      a!.style.opacity = "1";
      a!.style.transform = `scale(${1 + frac * 0.035})`;
      b!.src = FRAMES[next];
      b!.style.opacity = String(frac);
      b!.style.transform = "scale(1)";
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  const fixedChrome = (
    <div className="fixed inset-x-0 top-0 z-50 flex items-start justify-between p-4 sm:p-6 lg:px-10 lg:py-8">
      <Link
        href="/"
        className="font-serif text-sm tracking-[0.14em] text-white [mix-blend-mode:difference]"
      >
        ROZARIS
      </Link>
      <JoinMenu variant="bare" />
    </div>
  );

  if (reducedMotion || imagesFailed) {
    return (
      <div className="relative bg-neutral-900">
        {fixedChrome}
        <section className="relative flex h-dvh w-full items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-frame scroll sequence, not a normal content image */}
          <img
            src={FRAMES[0]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_45%]"
            onError={() => setImagesFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <HeroCopy />
        </section>
      </div>
    );
  }

  return (
    <div className="relative bg-neutral-900">
      {fixedChrome}
      <div ref={trackRef} className="relative h-[480vh] sm:h-[600vh]">
        <div className="sticky top-0 h-dvh w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- imperatively scrubbed via refs, not a static content image */}
          <img
            ref={layerARef}
            src={FRAMES[0]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_45%] will-change-transform"
            onError={() => setImagesFailed(true)}
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- imperatively scrubbed via refs, not a static content image */}
          <img
            ref={layerBRef}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_45%] opacity-0 will-change-transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <HeroCopy />
        </div>
      </div>
    </div>
  );
}

function HeroCopy() {
  const { t } = useT();
  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-end px-4 pb-20 text-center sm:pb-28">
      <h1 className="font-serif text-4xl text-white sm:text-5xl">{t("landing.heroTitle")}</h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
        {t("landing.heroSubtitle")}
      </p>
      <Link
        href="/search"
        className="mt-8 rounded-pill bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white hover:bg-brand-600"
      >
        {t("landing.browseAll")}
      </Link>
    </div>
  );
}
