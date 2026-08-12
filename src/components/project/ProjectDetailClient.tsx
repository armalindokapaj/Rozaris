"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  ArrowUpDown,
  BadgeCheck,
  Bath,
  BedDouble,
  Box,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Heart,
  Home,
  Landmark,
  MapPin,
  MessageCircleQuestion,
  Phone,
  Ruler,
  Scale,
  ShieldCheck,
  Sofa,
  Sparkles,
  Sun,
  Trees,
  Umbrella,
  Warehouse,
  Waves,
  X,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import en from "@/lib/i18n/en";
import sq from "@/lib/i18n/sq";
import { getListingForUnit, getNeighborhood } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { PublisherCard } from "@/components/listing/PublisherCard";
import { ShareButton } from "@/components/listing/ShareButton";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { ProjectShowcaseRow } from "@/components/project/ProjectShowcaseRow";
import { StaticContextMap } from "@/components/map/StaticContextMap";
import { MobileBottomTabBar } from "@/components/layout/MobileBottomTabBar";
import { AMENITY_LABELS, POI_LABELS, SITE_URL } from "@/lib/constants";
import { cn, telHref, whatsappHref } from "@/lib/utils";
import type { Amenity, Project, ProjectSetting, Unit } from "@/lib/types";

const SETTING_LABEL_KEY: Record<ProjectSetting, string> = {
  tower: "newProjectsPage.settingTower",
  beach: "newProjectsPage.settingBeach",
  residential_complex: "newProjectsPage.settingResidentialComplex",
};

const STATUS_LABEL_KEY: Record<Project["status"], string> = {
  coming_soon: "results.statusComingSoon",
  under_construction: "results.statusUnderConstruction",
  completed: "results.statusCompleted",
};

const UNIT_TAB_LABEL_KEY: Record<Unit["type"], string> = {
  residential: "projectDetail.tabApartments",
  commercial: "projectDetail.tabCommercial",
  parking: "projectDetail.tabParking",
  storage: "projectDetail.tabStorage",
};

const UNIT_STATUS_LABEL_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

const UNIT_STATUS_CLASS: Record<Unit["status"], string> = {
  available: "border-green-200 bg-green-50 text-green-700",
  reserved: "border-amber-200 bg-amber-50 text-amber-700",
  sold: "border-neutral-200 bg-neutral-100 text-neutral-500",
};

// Icon-only decoration for the "Project Highlights" grid — Amenity is a
// closed 9-value union, so this map is exhaustive and needs no fallback.
const AMENITY_ICON: Record<Amenity, typeof Waves> = {
  elevator: ArrowUpDown,
  parking: Car,
  garage: Warehouse,
  balcony: Sun,
  terrace: Umbrella,
  garden: Trees,
  pool: Waves,
  accessibility: Accessibility,
  furnished: Sofa,
};

const STAGE_NAMES = { en: en.project.stageNames, sq: sq.project.stageNames };

const NAV_ITEMS = [
  { id: "overview", labelKey: "projectDetail.navOverview" },
  { id: "gallery", labelKey: "projectDetail.navGallery" },
  { id: "availability", labelKey: "projectDetail.navAvailability" },
  { id: "construction", labelKey: "projectDetail.navConstruction" },
  { id: "amenities", labelKey: "projectDetail.navAmenities" },
  { id: "location", labelKey: "projectDetail.navLocation" },
  { id: "developer", labelKey: "projectDetail.navDeveloper" },
] as const;

const UNIT_PAGE_SIZE = 9;
const HERO_THUMBNAIL_COUNT = 4;

/** Public, SEO-indexable editorial page for a single development
 * (PRD_Project_Detail_Page) — the authoritative information + inventory
 * page, distinct from the dedicated /project/[slug] Three.js viewer it
 * links out to via "Explore in 3D". Layout: full-width hero (gallery +
 * title/actions), then a two-column body — main content plus a sticky
 * sidebar (Project Facts / Construction Progress / Quick Actions) — so
 * the page's key facts and actions stay reachable while browsing. */
export function ProjectDetailClient({
  project,
  related,
}: {
  project: Project;
  related: Project[];
}) {
  const { t, locale } = useT();
  const priceFmt = usePriceFormat();
  const auth = useAppStore((s) => s.auth);
  const saved = useAppStore((s) => s.saved.projects.includes(project.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedProject);
  const construction = useProjectConstruction(project);
  const neighborhood = getNeighborhood(project.neighborhoodId);
  const stageName = (order: number, fallback: string) => STAGE_NAMES[locale][order] ?? fallback;

  const [descExpanded, setDescExpanded] = useState(false);
  const [unitTab, setUnitTab] = useState<"all" | Unit["type"]>("all");
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const [unitsExpanded, setUnitsExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [heroIndex, setHeroIndex] = useState(0);

  const sectionRefs = useRef<Partial<Record<string, HTMLElement | null>>>({});

  // A project always has a hero image; the gallery is optional extra media
  // riding alongside it in the same thumbnail rail / lightbox.
  const media = useMemo(
    () => (project.gallery.length > 0 ? project.gallery : [project.heroImage]),
    [project.gallery, project.heroImage]
  );
  const heroThumbnails = media.slice(0, HERO_THUMBNAIL_COUNT);
  const remainingMediaCount = media.length - HERO_THUMBNAIL_COUNT;

  // Every seeded project only has an AVAILABLE unit's price count toward the
  // public from-price (PRD_Project_Detail_Page §13) — never a fabricated or
  // stale figure derived from sold/reserved inventory.
  const availableUnits = useMemo(
    () => project.units.filter((u) => u.status === "available"),
    [project.units]
  );
  const fromPrice = availableUnits.length
    ? Math.min(...availableUnits.map((u) => u.price))
    : null;

  const unitTypesPresent = useMemo(() => {
    const present = new Set(project.units.map((u) => u.type));
    return (["residential", "commercial", "parking", "storage"] as const).filter((ty) =>
      present.has(ty)
    );
  }, [project.units]);

  const unitTabs = useMemo(
    () => [
      { id: "all" as const, label: t("projectDetail.tabAll"), count: project.units.length },
      ...unitTypesPresent.map((ty) => ({
        id: ty,
        label: t(UNIT_TAB_LABEL_KEY[ty]),
        count: project.units.filter((u) => u.type === ty).length,
      })),
    ],
    [project.units, unitTypesPresent, t]
  );

  const filteredUnits = useMemo(() => {
    return project.units.filter((u) => {
      if (unitTab !== "all" && u.type !== unitTab) return false;
      if (bedroomFilter != null && u.type === "residential") {
        if (bedroomFilter === 4 ? u.bedrooms < 4 : u.bedrooms !== bedroomFilter) return false;
      }
      return true;
    });
  }, [project.units, unitTab, bedroomFilter]);

  const sortedUnits = useMemo(() => {
    const rank = (u: Unit) => (u.status === "available" ? 0 : u.status === "reserved" ? 1 : 2);
    return [...filteredUnits].sort((a, b) => rank(a) - rank(b) || a.price - b.price);
  }, [filteredUnits]);

  const displayedUnits = unitsExpanded ? sortedUnits : sortedUnits.slice(0, UNIT_PAGE_SIZE);
  const noneAvailableAtAll = availableUnits.length === 0;
  const topHighlights = project.amenities.slice(0, 6);

  const availableNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.id === "gallery") return project.gallery.length > 0;
        if (item.id === "amenities") return project.amenities.length > 0;
        return true;
      }),
    [project.gallery.length, project.amenities.length]
  );

  function scrollToSection(id: string) {
    const el = sectionRefs.current[id];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 116;
    window.scrollTo({ top, behavior: "smooth" });
  }

  useEffect(() => {
    function onScroll() {
      let current = availableNavItems[0]?.id ?? "overview";
      for (const item of availableNavItems) {
        const el = sectionRefs.current[item.id];
        if (el && el.getBoundingClientRect().top <= 130) current = item.id;
      }
      setActiveSection((prev) => (prev === current ? prev : current));
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [availableNavItems]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i === null ? i : (i - 1 + media.length) % media.length));
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i === null ? i : (i + 1) % media.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, media.length]);

  const whatsappTo = (messageKey: string) =>
    whatsappHref(project.developer.whatsapp, `${t(messageKey)} ${project.name}`);

  return (
    <div className="px-4 py-4 pb-20 lg:p-4">
      <MobileBottomTabBar />

      <nav aria-label={t("common.breadcrumb")} className="mb-4 flex items-center gap-1.5 text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-900">
          {t("nav.home")}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href="/new-projects" className="hover:text-neutral-900">
          {t("projectDetail.breadcrumbNewProjects")}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="truncate text-neutral-700">{project.name}</span>
      </nav>

      {/* Title row — PRD_Project_Detail_Page §4 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/developer/${project.developer.slug}`}
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand-600 hover:underline"
          >
            {project.developer.name}
            {project.developer.verified && <BadgeCheck className="h-3.5 w-3.5" />}
          </Link>
          <h1 className="mt-1.5 font-serif text-3xl text-neutral-900 sm:text-4xl">{project.name}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {neighborhood ? `${neighborhood.name}, ${project.city}` : project.city}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {t(STATUS_LABEL_KEY[project.status])}
            </span>
            {project.status === "under_construction" && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                {construction.progressPercent}% {t("project.progress")}
              </span>
            )}
            {project.premium && (
              <span className="rounded-full bg-listing-premium px-2.5 py-1 text-xs font-semibold text-white">
                {t("results.premium")}
              </span>
            )}
            <span className="rounded-full bg-listing-new-dev px-2.5 py-1 text-xs font-semibold text-white">
              {t("results.newProject")}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <ShareButton url={`${SITE_URL}/projects/${project.slug}`} title={project.name} className="w-auto" />
          <button
            onClick={() => auth.signedIn && toggleSaved(project.id)}
            disabled={!auth.signedIn}
            aria-pressed={saved}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            <Heart className={cn("h-4 w-4", saved && "fill-red-500 text-red-500")} />
            {saved ? t("projectDetail.saved") : t("projectDetail.save")}
          </button>
          <Link
            href={`/project/${project.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-control bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            <Box className="h-4 w-4" />
            {t("projectDetail.exploreIn3d")}
          </Link>
        </div>
      </div>

      {/* Hero gallery — thumbnail rail + main image, PRD §14 */}
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-[88px_1fr]">
        <div className="hidden gap-2.5 sm:grid sm:auto-rows-[68px] sm:overflow-hidden">
          {heroThumbnails.map((g, i) => {
            const isLastVisible = i === heroThumbnails.length - 1 && remainingMediaCount > 0;
            return (
              <button
                key={g + i}
                onClick={() => (isLastVisible ? setLightboxIndex(HERO_THUMBNAIL_COUNT) : setHeroIndex(i))}
                aria-current={!isLastVisible && heroIndex === i ? "true" : undefined}
                className={cn(
                  "group relative overflow-hidden rounded-card ring-2 ring-offset-1 transition-colors",
                  !isLastVisible && heroIndex === i ? "ring-brand-500" : "ring-transparent"
                )}
              >
                <PlaceholderImage
                  seed={`${project.slug}-thumb-${g}`}
                  kind={i === 0 ? "video" : "gallery"}
                  className="h-full w-full"
                />
                {isLastVisible && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-neutral-900/65 text-white">
                    <span className="text-sm font-bold">+{remainingMediaCount}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide">
                      {t("projectDetail.viewAll")}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-panel sm:aspect-[16/10]">
          <button
            onClick={() => setLightboxIndex(heroIndex)}
            className="absolute inset-0 h-full w-full"
            aria-label={t("projectDetail.galleryTitle")}
          >
            <PlaceholderImage seed={`${project.slug}-hero-${media[heroIndex]}`} kind="hero" className="h-full w-full" watermark />
          </button>
          {media.length > 1 && (
            <>
              <button
                aria-label={t("projectDetail.previousImage")}
                onClick={() => setHeroIndex((i) => (i - 1 + media.length) % media.length)}
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow hover:bg-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                aria-label={t("projectDetail.nextImage")}
                onClick={() => setHeroIndex((i) => (i + 1) % media.length)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow hover:bg-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
            <HeroStatPill icon={Building2} label={t("projectDetail.factBuildings").toLowerCase()} value={project.buildings.length} />
            <HeroStatPill icon={Home} label={t("project.totalUnits").toLowerCase()} value={project.totalUnits} />
            <HeroStatPill icon={Calendar} value={project.completionLabel} />
          </div>
        </div>
      </div>

      {/* Sticky local navigation — PRD §6 */}
      <div className="sticky top-16 z-30 -mx-4 mt-6 border-b border-neutral-200 bg-white px-4 lg:mx-0">
        <div className="flex items-center gap-5 overflow-x-auto">
          {availableNavItems.map(({ id, labelKey }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              aria-current={activeSection === id ? "page" : undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap py-3 text-sm font-semibold transition-colors",
                activeSection === id
                  ? "text-neutral-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand-500"
                  : "text-neutral-400 hover:text-neutral-700"
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column body: main content + sticky facts/actions sidebar */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="min-w-0 space-y-10">
          {/* About + Project Highlights — PRD §7/§18 */}
          <section id="overview" ref={(el: HTMLElement | null) => { sectionRefs.current.overview = el; }} className="scroll-mt-32">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.overviewTitle")}</h2>
                <p
                  className={cn(
                    "mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600",
                    !descExpanded && "line-clamp-5"
                  )}
                >
                  {project.description[locale]}
                </p>
                {project.description[locale].length > 300 && (
                  <button
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
                  >
                    {descExpanded ? t("projectDetail.readLess") : t("projectDetail.readMore")}
                  </button>
                )}
              </div>
              {topHighlights.length > 0 && (
                <div>
                  <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.highlightsTitle")}</h2>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
                    {topHighlights.map((a) => {
                      const Icon = AMENITY_ICON[a];
                      return (
                        <div key={a} className="flex items-start gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-600">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-900">{AMENITY_LABELS[locale][a]}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Gallery — PRD §14 (simplified: flat grid, no category taxonomy —
              the mock data model has no per-media category field to drive one) */}
          {project.gallery.length > 0 && (
            <section id="gallery" ref={(el: HTMLElement | null) => { sectionRefs.current.gallery = el; }} className="scroll-mt-32">
              <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.galleryTitle")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {project.gallery.map((g, i) => (
                  <button
                    key={g + i}
                    onClick={() => setLightboxIndex(i)}
                    className="group relative aspect-[4/3] overflow-hidden rounded-card"
                  >
                    <PlaceholderImage
                      seed={`${project.slug}-gallery-${g}`}
                      kind="gallery"
                      className="h-full w-full transition-transform group-hover:scale-105"
                      watermark
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Available Inventory — PRD §9/§10/§11/§12/§13 */}
          <section id="availability" ref={(el: HTMLElement | null) => { sectionRefs.current.availability = el; }} className="scroll-mt-32">
            <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.inventoryTitle")}</h2>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {unitTabs.map(({ id, label, count }) => (
                  <button
                    key={id}
                    onClick={() => setUnitTab(id)}
                    aria-pressed={unitTab === id}
                    className={cn(
                      "rounded-pill border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                      unitTab === id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
              {(unitTab === "all" || unitTab === "residential") && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setBedroomFilter(null)}
                    className={cn(
                      "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                      bedroomFilter === null
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    {t("projectDetail.bedroomsAll")}
                  </button>
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => setBedroomFilter(n)}
                      className={cn(
                        "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                        bedroomFilter === n
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      )}
                    >
                      {n === 4 ? t("projectDetail.bedroomsCountPlus", { count: 4 }) : `${n} ${t("results.bedAbbrev")}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {sortedUnits.length === 0 ? (
              <div className="mt-4 rounded-panel border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
                <p className="text-sm font-semibold text-neutral-700">
                  {noneAvailableAtAll && unitTab === "all" && bedroomFilter === null
                    ? t("projectDetail.noAvailabilityTitle")
                    : t("projectDetail.noAvailableUnits")}
                </p>
                {noneAvailableAtAll && unitTab === "all" && bedroomFilter === null && (
                  <p className="mt-1 text-xs text-neutral-500">{t("projectDetail.noAvailabilityBody")}</p>
                )}
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {displayedUnits.map((u) => (
                    <ProjectUnitCard key={u.id} project={project} unit={u} t={t} priceFmt={priceFmt} />
                  ))}
                </div>
                {sortedUnits.length > UNIT_PAGE_SIZE && (
                  <button
                    onClick={() => setUnitsExpanded((v) => !v)}
                    className="mt-4 flex w-full items-center justify-center rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    {unitsExpanded
                      ? t("projectDetail.showLessUnits")
                      : t("projectDetail.showMoreUnits", { count: sortedUnits.length - UNIT_PAGE_SIZE })}
                  </button>
                )}
              </>
            )}
          </section>

          {/* Construction Progress — PRD §16, reuses the existing full strip */}
          <section id="construction" ref={(el: HTMLElement | null) => { sectionRefs.current.construction = el; }} className="scroll-mt-32">
            <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.constructionTitle")}</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
              <ConstructionTimelineStrip stages={construction.stages} overallPercent={construction.progressPercent} />
              <div className="relative aspect-[4/3] overflow-hidden rounded-panel lg:aspect-auto">
                <PlaceholderImage seed={`${project.slug}-construction`} kind="facade" className="h-full w-full" watermark />
              </div>
            </div>
            <Link
              href={`/project/${project.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
            >
              <Box className="h-4 w-4" />
              {t("projectDetail.viewConstructionIn3d")}
            </Link>
          </section>

          {/* Amenities — PRD §18 */}
          {project.amenities.length > 0 && (
            <section id="amenities" ref={(el: HTMLElement | null) => { sectionRefs.current.amenities = el; }} className="scroll-mt-32">
              <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.amenitiesTitle")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {project.amenities.map((a) => (
                  <span key={a} className="flex items-center gap-2 text-sm text-neutral-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-500" />
                    {AMENITY_LABELS[locale][a]}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Location — PRD §19 */}
          <section id="location" ref={(el: HTMLElement | null) => { sectionRefs.current.location = el; }} className="scroll-mt-32">
            <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.locationTitle")}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {neighborhood ? `${neighborhood.name}, ${project.city}` : project.city}
            </p>
            <StaticContextMap center={project.coords} className="mt-3 aspect-[16/9] w-full" />
            {neighborhood && neighborhood.essentialPOIs.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-neutral-500">{t("projectDetail.nearby")}:</span>
                {neighborhood.essentialPOIs.map((poi) => (
                  <span key={poi} className="rounded-pill border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600">
                    {POI_LABELS[locale][poi]}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Developer Summary — PRD §20 */}
          <section id="developer" ref={(el: HTMLElement | null) => { sectionRefs.current.developer = el; }} className="scroll-mt-32">
            <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.developerTitle")}</h2>
            <div className="mt-3 rounded-panel border border-neutral-200 bg-white p-5">
              <PublisherCard
                bare
                publisher={project.developer}
                whatsappMessage={`Hi, I'm interested in ${project.name}`}
                contentTitle={project.name}
                contentUrl={`${SITE_URL}/projects/${project.slug}`}
              />
              {(project.developer.foundedYear || project.developer.awardsCount) && (
                <div className="mt-4 flex flex-wrap gap-4 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
                  {project.developer.foundedYear && (
                    <span>{t("developerProfile.since", { year: project.developer.foundedYear })}</span>
                  )}
                  {!!project.developer.awardsCount && (
                    <span>{t("developerProfile.awardsCount", { count: project.developer.awardsCount })}</span>
                  )}
                </div>
              )}
              <Link
                href={`/developer/${project.developer.slug}`}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                {t("projectDetail.viewDeveloperProfile")}
              </Link>
            </div>
          </section>

          {/* Helpful Tools & Services — PRD §21 */}
          {fromPrice != null && (
            <section aria-label={t("projectDetail.toolsTitle")}>
              <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.toolsTitle")}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <ToolCard
                  icon={Landmark}
                  title={t("mortgage.title")}
                  body={t("projectDetail.toolMortgageBody")}
                  href="/resources/mortgage-calculator"
                  cta={t("results.viewDetails")}
                />
                <ToolCard
                  icon={ShieldCheck}
                  title={t("insurance.title")}
                  body={t("projectDetail.toolInsuranceBody")}
                  href="/resources/mortgage-calculator"
                  cta={t("results.viewDetails")}
                />
                <ToolCard
                  icon={Sparkles}
                  title={t("projectDetail.toolInteriorDesignTitle")}
                  body={t("projectDetail.toolInteriorDesignBody")}
                  href="/resources/interior-design"
                  cta={t("results.viewDetails")}
                />
                <ToolCard
                  icon={Scale}
                  title={t("projectDetail.toolRentVsBuyTitle")}
                  body={t("projectDetail.toolRentVsBuyBody")}
                  href={`/rent-vs-buy?price=${fromPrice}&location=${encodeURIComponent(
                    `${neighborhood?.name ?? ""}, ${project.city}`
                  )}`}
                  cta={t("results.viewDetails")}
                />
              </div>
            </section>
          )}

          {/* Related Projects — PRD §3 */}
          {related.length > 0 && (
            <section aria-label={t("projectDetail.relatedTitle")}>
              <h2 className="font-serif text-xl text-neutral-900">{t("projectDetail.relatedTitle")}</h2>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {related.map((p) => (
                  <ProjectShowcaseRow key={p.id} project={p} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar — Project Facts / Construction Progress / Quick Actions */}
        <aside className="glass-panel divide-y divide-neutral-100 overflow-hidden rounded-panel lg:sticky lg:top-20 lg:self-start">
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-400">
              {t("projectDetail.factsTitle")}
            </p>
            <div className="mt-2">
              <FactRow
                label={t("projectDetail.factDeveloper")}
                value={
                  <Link href={`/developer/${project.developer.slug}`} className="text-brand-600 hover:underline">
                    {project.developer.name}
                  </Link>
                }
              />
              <FactRow label={t("projectDetail.factProjectType")} value={t(SETTING_LABEL_KEY[project.setting])} />
              <FactRow label={t("projectDetail.factBuildings")} value={project.buildings.length} />
              <FactRow label={t("projectDetail.factTotalUnits")} value={project.totalUnits} />
              <FactRow label={t("projectDetail.factAvailableUnits")} value={project.availableUnits} />
              {project.status === "under_construction" && (
                <FactRow label={t("projectDetail.factConstruction")} value={`${construction.progressPercent}%`} />
              )}
              <FactRow label={t("projectDetail.factCompletion")} value={project.completionLabel} />
              <FactRow label={t("projectDetail.factStatus")} value={t(STATUS_LABEL_KEY[project.status])} />
              <FactRow
                label={t("projectDetail.factFromPrice")}
                value={fromPrice != null ? priceFmt(fromPrice) : t("projectDetail.priceOnRequest")}
              />
            </div>
          </div>

          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-400">
              {t("projectDetail.constructionTitle")}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-2xl font-bold text-brand-600">{construction.progressPercent}%</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${construction.progressPercent}%` }}
                />
              </div>
            </div>
            <ul className="mt-3.5 space-y-2.5">
              {construction.stages.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 text-xs">
                  {s.status === "done" ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : s.status === "active" ? (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full border-2 border-neutral-300" />
                  )}
                  <span className={cn("flex-1 truncate font-medium", s.status === "upcoming" ? "text-neutral-400" : "text-neutral-800")}>
                    {stageName(s.order, s.name)}
                  </span>
                  <span className="shrink-0 text-neutral-400">
                    {s.status === "done"
                      ? t("projectDetail.stageCompleted")
                      : s.status === "active"
                      ? t("projectDetail.stageInProgress")
                      : t("projectDetail.stageUpcoming")}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => scrollToSection("construction")}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-control border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              {t("projectDetail.viewProgressGallery")}
            </button>
          </div>

          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-400">
              {t("projectDetail.quickActionsTitle")}
            </p>
            <div className="mt-2 -mx-1">
              <QuickActionRow
                icon={Download}
                title={t("projectDetail.getBrochure")}
                body={t("projectDetail.getBrochureBody")}
                href={whatsappTo("projectDetail.whatsappBrochureMessage")}
              />
              <QuickActionRow
                icon={Calendar}
                title={t("projectDetail.scheduleVisit")}
                body={t("projectDetail.scheduleVisitBody")}
                href={whatsappTo("projectDetail.whatsappScheduleMessage")}
              />
              <QuickActionRow
                icon={Phone}
                title={t("projectDetail.contactDeveloperAction")}
                body={project.developer.phone}
                href={telHref(project.developer.phone)}
              />
              <QuickActionRow
                icon={MessageCircleQuestion}
                title={t("projectDetail.askQuestion")}
                body={t("projectDetail.askQuestionBody")}
                href={whatsappTo("projectDetail.whatsappQuestionMessage")}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Gallery lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/90 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            aria-label={t("projectDetail.closeGallery")}
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 text-white/80 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
          {media.length > 1 && (
            <button
              aria-label={t("projectDetail.previousImage")}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? i : (i - 1 + media.length) % media.length));
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}
          <div className="relative aspect-[4/3] w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <PlaceholderImage
              seed={`${project.slug}-gallery-${media[lightboxIndex]}`}
              kind="gallery"
              className="h-full w-full rounded-panel"
              iconClassName="h-14 w-14"
              watermark
            />
          </div>
          {media.length > 1 && (
            <button
              aria-label={t("projectDetail.nextImage")}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? i : (i + 1) % media.length));
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HeroStatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label?: string;
  value: string | number;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 shadow">
      <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      {value}
      {label ? ` ${label}` : ""}
    </span>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-neutral-100 py-2.5 text-sm first:border-t-0 first:pt-0">
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold text-neutral-800">{value}</span>
    </div>
  );
}

function QuickActionRow({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: typeof Download;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="flex items-center gap-3 rounded-control px-1 py-2 text-left transition-colors hover:bg-neutral-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-neutral-900">{title}</span>
        <span className="block truncate text-xs text-neutral-500">{body}</span>
      </span>
    </a>
  );
}

function ToolCard({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: typeof Landmark;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-panel border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 hover:shadow-[var(--shadow-1)]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-card bg-brand-50 text-brand-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="text-sm font-bold text-neutral-900">{title}</p>
      <p className="text-xs text-neutral-500">{body}</p>
      <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-semibold text-brand-600">
        {cta}
        <ChevronRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

function ProjectUnitCard({
  project,
  unit,
  t,
  priceFmt,
}: {
  project: Project;
  unit: Unit;
  t: (key: string, vars?: Record<string, string | number>) => string;
  priceFmt: (amount: number, opts?: { compact?: boolean }) => string;
}) {
  const listing = getListingForUnit(project, unit);
  const card = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <PlaceholderImage seed={`${project.id}-${unit.id}`} kind="interior" className="h-full w-full" />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
            UNIT_STATUS_CLASS[unit.status]
          )}
        >
          {t(UNIT_STATUS_LABEL_KEY[unit.status])}
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-bold text-neutral-900">{unit.code}</p>
          <p className="shrink-0 text-xs text-neutral-500">{t("results.floorNum", { floor: unit.floor })}</p>
        </div>
        {unit.type === "residential" ? (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" />
              {unit.bedrooms}
            </span>
            <span className="flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" />
              {unit.bathrooms}
            </span>
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {unit.area}m²
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-neutral-500">
            {t(UNIT_TAB_LABEL_KEY[unit.type])} · {unit.area}m²
          </p>
        )}
        <p className="mt-2 text-base font-bold text-neutral-900">{priceFmt(unit.price)}</p>
      </div>
    </>
  );

  if (listing) {
    return (
      <Link
        href={`/listing/${listing.slug}`}
        className="block overflow-hidden rounded-card border border-neutral-200 bg-white transition-colors hover:border-neutral-300 hover:shadow-[var(--shadow-1)]"
      >
        {card}
        <div className="border-t border-neutral-100 p-2.5 text-center text-xs font-semibold text-brand-600">
          {t("projectDetail.viewUnit")}
        </div>
      </Link>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-neutral-200 bg-white opacity-90">
      {card}
      <div className="border-t border-neutral-100 p-2.5 text-center text-xs text-neutral-400">
        {t("projectDetail.contactDeveloper")}
      </div>
    </div>
  );
}
