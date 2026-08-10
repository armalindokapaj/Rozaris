"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { PublisherAvatar } from "@/components/developers/PublisherAvatar";
import { ProjectShowcaseRow } from "@/components/project/ProjectShowcaseRow";
import { ListingCard } from "@/components/results/ListingCard";
import { MobileBottomTabBar } from "@/components/layout/MobileBottomTabBar";
import { useT } from "@/lib/i18n/useT";
import { useClickOutside } from "@/hooks/useClickOutside";
import { SORT_LABELS } from "@/lib/constants";
import { telHref, whatsappHref, cn } from "@/lib/utils";
import type { Listing, Project, Publisher } from "@/lib/types";

const TYPE_LABEL_KEY: Record<Publisher["type"], string> = {
  private_owner: "publisher.typePrivateOwner",
  agency: "publisher.typeAgency",
  developer: "publisher.typeDeveloper",
};

type TabId = "projects" | "about" | "awards";
type SortId = "newest" | "price_asc" | "price_desc";
const SORT_OPTIONS: SortId[] = ["newest", "price_asc", "price_desc"];

function projectFromPrice(project: Project): number | null {
  return project.units.length ? Math.min(...project.units.map((u) => u.price)) : null;
}

function MetaRow({ icon: Icon, value, label }: { icon: typeof Calendar; value: string; label: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
      <div>
        <p className="text-sm font-medium text-neutral-800">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-bold leading-tight text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function SortMenu({ value, onChange, locale }: { value: SortId; onChange: (v: SortId) => void; locale: "en" | "sq" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const { t } = useT();
  const sortLabels = SORT_LABELS[locale];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-control border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-300"
      >
        <span className="text-neutral-400">{t("results.sortByPrefix")}</span>
        {sortLabels[value]}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-44 rounded-card border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)]">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {sortLabels[opt]}
              {value === opt && <Check className="h-3.5 w-3.5 text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeveloperProfileClient({
  publisher,
  projects,
  listings,
}: {
  publisher: Publisher;
  projects: Project[];
  listings: Listing[];
}) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<TabId>(projects.length > 0 ? "projects" : "about");
  const [sort, setSort] = useState<SortId>("newest");

  const sortedProjects = useMemo(() => {
    if (sort === "newest") return projects;
    return [...projects].sort((a, b) => {
      const pa = projectFromPrice(a) ?? Infinity;
      const pb = projectFromPrice(b) ?? Infinity;
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
  }, [projects, sort]);

  const TABS: { id: TabId; label: string }[] = [
    { id: "projects", label: t("developerProfile.tabProjects", { count: projects.length }) },
    { id: "about", label: t("developerProfile.tabAbout") },
    ...(publisher.awardsCount ? [{ id: "awards" as const, label: t("developerProfile.tabAwards") }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24 lg:px-8 lg:pb-8">
      <MobileBottomTabBar />

      <nav aria-label={t("common.breadcrumb")} className="mb-4 flex items-center gap-1.5 text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-900">
          {t("nav.home")}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href="/developers" className="hover:text-neutral-900">
          {t("developerProfile.breadcrumbDirectory")}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="truncate text-neutral-700">{publisher.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] lg:items-start">
        <aside className="rounded-panel border border-neutral-200 bg-white p-5 lg:sticky lg:top-20">
          <PublisherAvatar publisher={publisher} className="h-20 w-20 text-2xl" />
          <h1 className="mt-3 flex items-center gap-1.5 font-serif text-xl text-neutral-900">
            {publisher.name}
            {publisher.verified && <BadgeCheck className="h-5 w-5 shrink-0 text-brand-500" />}
          </h1>
          <p className="text-sm font-medium text-brand-600">{t(TYPE_LABEL_KEY[publisher.type])}</p>
          {publisher.city && (
            <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
              <MapPin className="h-3.5 w-3.5" /> {publisher.city}
            </p>
          )}

          {publisher.bio && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-sm leading-relaxed text-neutral-600">
              {publisher.bio}
            </p>
          )}

          {(publisher.foundedYear || publisher.awardsCount || publisher.verified) && (
            <div className="mt-3 space-y-2.5 border-t border-neutral-100 pt-3">
              {publisher.foundedYear && (
                <MetaRow
                  icon={Calendar}
                  value={t("developerProfile.since", { year: publisher.foundedYear })}
                  label={t("developerProfile.yearEstablished")}
                />
              )}
              {!!publisher.awardsCount && (
                <MetaRow
                  icon={Trophy}
                  value={t("developerProfile.awardsCount", { count: publisher.awardsCount })}
                  label={t("developerProfile.industryRecognition")}
                />
              )}
              {publisher.verified && (
                <MetaRow
                  icon={ShieldCheck}
                  value={t("developerProfile.verifiedPublisher")}
                  label={t("developerProfile.qualityChecked")}
                />
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <a
              href={whatsappHref(publisher.whatsapp, `Përshëndetje ${publisher.name}, ju gjeta në ROZARIS`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-control bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:brightness-95"
            >
              <MessageCircle className="h-4 w-4" /> {t("publisher.whatsapp")}
            </a>
            <a
              href={telHref(publisher.phone)}
              className="flex items-center justify-center gap-1.5 rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <Phone className="h-4 w-4" /> {t("publisher.call")}
            </a>
          </div>

          <div className="mt-4 flex items-center gap-6 border-t border-neutral-100 pt-3.5">
            {projects.length > 0 && <StatCell value={projects.length} label={t("developersPage.projectsLabel")} />}
            <StatCell value={listings.length} label={t("developersPage.listingsLabel")} />
          </div>

          <button
            onClick={() => setTab("about")}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
          >
            {t("developerProfile.viewCompanyProfile")} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200">
            <div className="flex items-center gap-5">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={cn(
                    "relative pb-3 text-sm font-semibold transition-colors",
                    tab === id
                      ? "text-neutral-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand-500"
                      : "text-neutral-400 hover:text-neutral-700"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "projects" && projects.length > 1 && <SortMenu value={sort} onChange={setSort} locale={locale} />}
          </div>

          <div className="mt-5">
            {tab === "projects" &&
              (sortedProjects.length === 0 ? (
                <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
                  {t("developerProfile.noProjectsYet")}
                </p>
              ) : (
                <div className="space-y-4">
                  {sortedProjects.map((p) => (
                    <ProjectShowcaseRow key={p.id} project={p} />
                  ))}
                </div>
              ))}

            {tab === "about" && (
              <div className="space-y-6">
                {publisher.bio && <p className="text-sm leading-relaxed text-neutral-600">{publisher.bio}</p>}
                <div>
                  <h2 className="font-serif text-lg text-neutral-900">
                    {t("developerProfile.activeListingsHeading", { count: listings.length })}
                  </h2>
                  {listings.length === 0 ? (
                    <p className="mt-3 rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
                      {t("developerProfile.noListingsYet")}
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {listings.map((l) => (
                        <ListingCard key={l.id} listing={l} variant="grid" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "awards" && (
              <p className="rounded-panel border border-neutral-200 bg-white p-6 text-sm leading-relaxed text-neutral-600">
                {publisher.awardsCount
                  ? t("developerProfile.awardsBodyWithCount", { name: publisher.name, count: publisher.awardsCount })
                  : t("developerProfile.noAwardsYet")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
