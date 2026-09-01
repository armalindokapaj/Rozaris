"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { getNeighborhood } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";
import { useLiveProjects } from "@/hooks/useLiveProjects";
import { useT } from "@/lib/i18n/useT";
import { cn, formatPrice } from "@/lib/utils";
import type { Project } from "@/lib/types";

function fromPrice(project: Project) {
  const available = project.units.filter((u) => u.status === "available");
  const pool = available.length > 0 ? available : project.units;
  return pool.reduce((min, u) => Math.min(min, u.price), Infinity);
}

function PromoCard({ project }: { project: Project }) {
  const { t } = useT();
  const neighborhood = getNeighborhood(project.neighborhoodId);
  const price = fromPrice(project);
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="relative flex h-32 w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(17,24,39,0.12)]"
    >
      <PlaceholderImage seed={project.slug} kind="hero" className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/85 via-neutral-900/15 to-transparent" />
      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.04em] text-brand-700">
        {t("results.newProject")}
      </span>
      <div className="relative mt-auto flex w-full items-end justify-between gap-2 p-3.5">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold leading-tight text-white">{project.name}</span>
          <span className="block truncate text-[11px] text-white/75">
            {neighborhood?.name ?? project.city}
            {Number.isFinite(price) && ` · ${t("map.from")} ${formatPrice(price, "EUR", { compact: true })}`}
          </span>
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-neutral-900">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export function MobilePromoBanner() {
  const { t } = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveProjects = useAppStore((s) => s.liveProjects);
  useLiveProjects();

  const PROMO_PROJECTS = useMemo(
    () => (liveProjects ?? []).filter((p) => p.premium).slice(0, 3),
    [liveProjects]
  );
  const LOOPABLE = PROMO_PROJECTS.length > 1;
  const SLIDES = LOOPABLE
    ? [PROMO_PROJECTS[PROMO_PROJECTS.length - 1], ...PROMO_PROJECTS, PROMO_PROJECTS[0]]
    : PROMO_PROJECTS;

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !LOOPABLE) return;
    const cardWidth = el.scrollWidth / SLIDES.length;
    el.scrollLeft = cardWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LOOPABLE]);

  if (PROMO_PROJECTS.length === 0) return null;

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / SLIDES.length;
    const rawIndex = Math.round(el.scrollLeft / cardWidth);

    if (!LOOPABLE) {
      setActive(rawIndex);
      return;
    }

    setActive(((rawIndex - 1) % PROMO_PROJECTS.length + PROMO_PROJECTS.length) % PROMO_PROJECTS.length);

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (rawIndex === 0) {
        el.scrollLeft = cardWidth * PROMO_PROJECTS.length;
      } else if (rawIndex === SLIDES.length - 1) {
        el.scrollLeft = cardWidth;
      }
    }, 120);
  };

  return (
    <div className="mt-3.5">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500">
          {t("home.featuredDevelopments")}
        </span>
      </div>

      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SLIDES.map((project, i) => (
          <PromoCard key={`${project.id}-${i}`} project={project} />
        ))}
      </div>

      {PROMO_PROJECTS.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {PROMO_PROJECTS.map((project, i) => (
            <span
              key={project.id}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200 ease-[var(--ease-rz)]",
                i === active ? "w-4 bg-brand-600" : "w-1.5 bg-neutral-300"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
