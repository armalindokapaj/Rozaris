"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronDown, ChevronRight, Grid3x3, List, Search } from "lucide-react";
import { HeroSketch } from "@/components/common/HeroSketch";
import { Footer } from "@/components/layout/Footer";
import { PublisherAvatar } from "@/components/developers/PublisherAvatar";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Publisher } from "@/lib/types";

type PublisherWithCounts = {
  publisher: Publisher;
  projectCount: number;
  listingCount: number;
};

const TYPE_LABEL_KEY: Record<Publisher["type"], string> = {
  private_owner: "publisher.typePrivateOwner",
  agency: "publisher.typeAgency",
  developer: "publisher.typeDeveloper",
};

const TYPES: Publisher["type"][] = ["developer", "agency", "private_owner"];

type SortId = "az" | "mostProjects" | "mostListings";
const SORTS: SortId[] = ["az", "mostProjects", "mostListings"];

function Dropdown({
  label,
  activeLabel,
  children,
}: {
  label: string;
  activeLabel?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-11 items-center gap-2 whitespace-nowrap rounded-control border border-neutral-200 bg-white px-3.5 text-sm text-neutral-700 hover:border-neutral-300"
      >
        {activeLabel ?? label}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 rounded-card border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function DropdownOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
    >
      {children}
      {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
    </button>
  );
}

export function DevelopersDirectoryClient({ publishers }: { publishers: PublisherWithCounts[] }) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<Publisher["type"] | "all">("all");
  const [sort, setSort] = useState<SortId>("az");
  const [view, setView] = useState<"grid" | "list">("grid");

  const sortLabels: Record<SortId, string> = {
    az: t("developersPage.sortAz"),
    mostProjects: t("developersPage.sortMostProjects"),
    mostListings: t("developersPage.sortMostListings"),
  };
  const typeLabels: Record<Publisher["type"], string> = {
    private_owner: t(TYPE_LABEL_KEY.private_owner),
    agency: t(TYPE_LABEL_KEY.agency),
    developer: t(TYPE_LABEL_KEY.developer),
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publishers
      .filter(({ publisher: p }) => (type === "all" ? true : p.type === type))
      .filter(({ publisher: p }) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (sort === "mostProjects") return b.projectCount - a.projectCount;
        if (sort === "mostListings") return b.listingCount - a.listingCount;
        return a.publisher.name.localeCompare(b.publisher.name);
      });
  }, [publishers, query, type, sort]);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h1 className="font-serif text-4xl text-neutral-900 sm:text-5xl">
              {t("developersPage.title")}
            </h1>
            <p className="mt-2 text-sm text-neutral-500 sm:text-base">{t("developersPage.subtitle")}</p>
          </div>
          <HeroSketch className="hidden h-32 w-52 shrink-0 text-neutral-300 sm:block" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-neutral-200 bg-white px-3.5 sm:min-w-[16rem] sm:flex-none">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("developersPage.searchPlaceholder")}
              className="w-full bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
            />
          </div>

          <Dropdown
            label={t("developersPage.allTypes")}
            activeLabel={type === "all" ? t("developersPage.allTypes") : typeLabels[type]}
          >
            {(close) => (
              <>
                <DropdownOption active={type === "all"} onClick={() => { setType("all"); close(); }}>
                  {t("developersPage.allTypes")}
                </DropdownOption>
                {TYPES.map((ty) => (
                  <DropdownOption key={ty} active={type === ty} onClick={() => { setType(ty); close(); }}>
                    {typeLabels[ty]}
                  </DropdownOption>
                ))}
              </>
            )}
          </Dropdown>

          <span className="flex h-11 items-center gap-1.5 rounded-control border border-neutral-200 bg-neutral-50 px-3.5 text-sm text-neutral-600">
            {t("developersPage.locationTirana")}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Dropdown label={sortLabels[sort]} activeLabel={`${t("results.sortByPrefix")} ${sortLabels[sort]}`}>
              {(close) => (
                <>
                  {SORTS.map((s) => (
                    <DropdownOption key={s} active={sort === s} onClick={() => { setSort(s); close(); }}>
                      {sortLabels[s]}
                    </DropdownOption>
                  ))}
                </>
              )}
            </Dropdown>

            <div className="flex items-center gap-0.5 rounded-control border border-neutral-200 bg-white p-1">
              <button
                onClick={() => setView("grid")}
                aria-pressed={view === "grid"}
                aria-label={t("developersPage.viewGrid")}
                className={cn("flex h-8 w-8 items-center justify-center rounded-[6px]", view === "grid" ? "bg-neutral-900 text-white" : "text-neutral-500")}
              >
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                aria-label={t("developersPage.viewList")}
                className={cn("flex h-8 w-8 items-center justify-center rounded-[6px]", view === "list" ? "bg-neutral-900 text-white" : "text-neutral-500")}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <p className="mt-5 text-sm text-neutral-500">
          {t("developersPage.resultsCount", { count: filtered.length })}
        </p>

        {filtered.length === 0 ? (
          <p className="mt-4 rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
            {t("developersPage.noneMatch")}
          </p>
        ) : (
          <div
            className={cn(
              "mt-3 grid grid-cols-1 gap-4",
              view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : ""
            )}
          >
            {filtered.map(({ publisher: p, projectCount, listingCount }) => (
              <Link
                key={p.id}
                href={`/developer/${p.slug}`}
                className={cn(
                  "group rounded-panel border border-neutral-200 bg-white p-4 hover:border-neutral-300 hover:shadow-[var(--shadow-1)]",
                  view === "list" && "flex items-center gap-6"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <PublisherAvatar publisher={p} className="h-14 w-14 text-xl" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-serif text-lg text-neutral-900">
                        {p.name}
                        {p.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-500" />}
                      </p>
                      <p className="text-sm text-neutral-500">{typeLabels[p.type]}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 group-hover:text-neutral-500" />
                </div>

                <div
                  className={cn(
                    "flex items-center gap-6 border-neutral-100 text-sm",
                    view === "list" ? "shrink-0 border-l pl-6" : "mt-3.5 border-t pt-3.5"
                  )}
                >
                  {projectCount > 0 && (
                    <div>
                      <p className="font-semibold text-neutral-900">{projectCount}</p>
                      <p className="text-xs text-neutral-500">{t("developersPage.projectsLabel")}</p>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-neutral-900">{listingCount}</p>
                    <p className="text-xs text-neutral-500">{t("developersPage.listingsLabel")}</p>
                  </div>
                </div>

                <p
                  className={cn(
                    "flex items-center gap-1 text-sm font-semibold text-brand-600",
                    view === "list" ? "ml-auto shrink-0" : "mt-3"
                  )}
                >
                  {t("developersPage.viewProfile")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
