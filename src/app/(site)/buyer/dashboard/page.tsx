"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Heart,
  LayoutDashboard,
  Bookmark,
  SquareStack,
  Clock,
  Bell,
  MessageCircle,
  Settings,
  User,
  X,
  ShieldCheck,
  Lock,
  Monitor,
  CheckCircle2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useUrlTab } from "@/hooks/useUrlTab";
import { useT } from "@/lib/i18n/useT";
import { useLiveListings } from "@/hooks/useLiveListings";
import { useLiveProjects } from "@/hooks/useLiveProjects";
import { getNeighborhood } from "@/lib/mockData";
import { projectUnitListingsFrom } from "@/lib/projects";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { ListingCard } from "@/components/results/ListingCard";
import { ProjectCard } from "@/components/results/ProjectCard";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { NotificationsList } from "@/components/dashboard/NotificationsList";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useAccountNotifications } from "@/hooks/useAccountNotifications";
import type {
  BuyerPreferences,
  CompareEntity,
  Listing,
  NotificationItem,
  Project,
  PropertyType,
  RecentlyViewedEntry,
  SavedSearch,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", labelKey: "user.tabOverview", icon: LayoutDashboard },
  { id: "saved", labelKey: "user.tabSaved", icon: Bookmark },
  { id: "compare", labelKey: "user.tabCompare", icon: SquareStack },
  { id: "recent", labelKey: "user.tabRecent", icon: Clock },
  { id: "alerts", labelKey: "user.tabAlerts", icon: Bell },
  { id: "messages", labelKey: "buyer.tabMessages", icon: MessageCircle },
  { id: "preferences", labelKey: "buyer.tabPreferences", icon: Settings },
  { id: "profile", labelKey: "buyer.tabProfile", icon: User },
  { id: "security", labelKey: "buyer.tabSecurity", icon: ShieldCheck },
  { id: "privacy", labelKey: "buyer.tabPrivacy", icon: Lock },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PROPERTY_TYPES: PropertyType[] = [
  "apartment",
  "house",
  "villa",
  "studio",
  "land",
  "commercial",
  "office",
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function matchesPreferences(listing: Listing, prefs: BuyerPreferences): boolean {
  if (listing.status !== "active") return false;
  if (prefs.transaction === "buy" && listing.transaction === "rent") return false;
  if (prefs.transaction === "rent" && listing.transaction !== "rent") return false;
  if (prefs.propertyTypes.length && !prefs.propertyTypes.includes(listing.propertyType)) return false;
  if (prefs.priceMax != null && listing.price > prefs.priceMax) return false;
  const locToken = prefs.location.split(",")[0]?.trim().toLowerCase();
  if (locToken) {
    const neighborhood = getNeighborhood(listing.neighborhoodId);
    const haystack = `${listing.city} ${neighborhood?.name ?? ""}`.toLowerCase();
    if (!haystack.includes(locToken)) return false;
  }
  return true;
}

/** User Dashboard (PRD_ROZARIS_User_Types §2) — a personal discovery
 * workspace, not a publishing surface. Reuses the same store slices the
 * standalone /saved page and the header's Compare overlay already read
 * (saved.*, savedSearches, compare, recentlyViewed) so every one of these
 * views always agrees with each other. Notifications are real
 * (`useAccountNotifications`, see Account & Profile System PRD v1.0
 * §13), not a store slice. */
export default function BuyerDashboardPage() {
  // Suspense boundary: reads the active tab from `?tab=` via `useUrlTab`,
  // and `useSearchParams()` requires one per Next.js.
  return (
    <Suspense fallback={null}>
      <BuyerDashboardPageInner />
    </Suspense>
  );
}

function BuyerDashboardPageInner() {
  const auth = useAppStore((s) => s.auth);
  const openSignIn = useAppStore((s) => s.openSignIn);
  const buyerProfile = useAppStore((s) => s.buyerProfile);
  const conversations = useAppStore((s) => s.conversations);
  const saved = useAppStore((s) => s.saved);
  const savedSearches = useAppStore((s) => s.savedSearches);
  const compare = useAppStore((s) => s.compare);
  const recentlyViewed = useAppStore((s) => s.recentlyViewed);
  const liveListings = useAppStore((s) => s.liveListings);
  const liveProjects = useAppStore((s) => s.liveProjects);
  useLiveListings();
  useLiveProjects();
  const searchableListings = useMemo(
    () => [...(liveListings ?? []), ...projectUnitListingsFrom(liveProjects ?? [])],
    [liveListings, liveProjects]
  );
  const mounted = useHasMounted();
  const { t } = useT();
  const [tab, setTab] = useUrlTab<TabId>("/buyer/dashboard", TABS.map((tb) => tb.id), "overview");

  const isBuyer = auth.signedIn && auth.role === "buyer" && buyerProfile;
  const { notifications, readIds: notificationReadIds, unreadCount, markRead, markAllRead } =
    useAccountNotifications();

  if (!mounted) return null;

  if (!isBuyer) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Heart className="h-10 w-10 text-brand-500" />
        <h1 className="font-serif text-xl text-neutral-900">{t("buyer.signInRequiredTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("buyer.signInRequiredBody")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href="/buyer/signup"
            className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t("buyer.becomeABuyer")}
          </Link>
          <button
            onClick={openSignIn}
            className="rounded-control border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {t("saved.signInDemo")}
          </button>
        </div>
      </div>
    );
  }

  const savedListings = searchableListings.filter((l) => saved.listings.includes(l.id));
  const savedProjects = (liveProjects ?? []).filter((p) => saved.projects.includes(p.id));
  const myConversations = conversations.filter((c) => c.buyerId === buyerProfile.id);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <div className="mb-4 rounded-panel border border-neutral-200 bg-white p-3.5">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {t("buyer.welcomeBack", { name: buyerProfile.name })}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto scroll-thin lg:flex-col lg:overflow-visible">
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium",
                tab === id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
              {id === "alerts" && unreadCount > 0 && (
                <span className="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {tab === "overview" && (
          <OverviewTab
            name={buyerProfile.name}
            savedListingsCount={savedListings.length}
            savedProjectsCount={savedProjects.length}
            savedSearches={savedSearches}
            recentlyViewed={recentlyViewed}
            unreadAlerts={unreadCount}
            preferences={buyerProfile.preferences}
            priceAlerts={notifications.filter((n) => n.type === "price_change")}
            notificationReadIds={notificationReadIds}
            onMarkNotificationRead={markRead}
            onMarkAllNotificationsRead={markAllRead}
            searchableListings={searchableListings}
          />
        )}
        {tab === "saved" && <SavedTab listings={savedListings} projects={savedProjects} />}
        {tab === "compare" && <CompareTab items={compare} />}
        {tab === "recent" && (
          <RecentTab entries={recentlyViewed} searchableListings={searchableListings} projects={liveProjects ?? []} />
        )}
        {tab === "alerts" && (
          <div className="space-y-4">
            <h1 className="font-serif text-xl text-neutral-900">{t("user.tabAlerts")}</h1>
            <NotificationsList
              items={notifications}
              readIds={notificationReadIds}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
            />
          </div>
        )}
        {tab === "messages" && (
          <div className="space-y-4">
            <h1 className="font-serif text-xl text-neutral-900">{t("buyer.tabMessages")}</h1>
            <MessagesPanel conversations={myConversations} viewerId={buyerProfile.id} />
          </div>
        )}
        {tab === "preferences" && <PreferencesTab preferences={buyerProfile.preferences} />}
        {tab === "profile" && (
          <div className="space-y-6">
            <PendingInvitations />
            <ProfileTab />
            <IdentityVerificationCard />
          </div>
        )}
        {tab === "security" && <SecurityTab />}
        {tab === "privacy" && <PrivacyTab />}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Bookmark }) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4">
      <Icon className="h-4.5 w-4.5 text-brand-500" />
      <p className="mt-2 text-xl font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function OverviewTab({
  name,
  savedListingsCount,
  savedProjectsCount,
  savedSearches,
  recentlyViewed,
  unreadAlerts,
  preferences,
  priceAlerts,
  notificationReadIds,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  searchableListings,
}: {
  name: string;
  savedListingsCount: number;
  savedProjectsCount: number;
  savedSearches: SavedSearch[];
  recentlyViewed: RecentlyViewedEntry[];
  unreadAlerts: number;
  preferences: BuyerPreferences;
  priceAlerts: NotificationItem[];
  notificationReadIds: string[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: (ids: string[]) => void;
  searchableListings: Listing[];
}) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const removeSavedSearch = useAppStore((s) => s.removeSavedSearch);

  const recentListings = useMemo(
    () =>
      recentlyViewed
        .filter((e) => e.kind === "listing")
        .map((e) => searchableListings.find((l) => l.id === e.id))
        .filter((l): l is Listing => !!l)
        .slice(0, 8),
    [recentlyViewed, searchableListings]
  );

  const recommended = useMemo(
    () =>
      searchableListings
        .filter((l) => matchesPreferences(l, preferences))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3),
    [preferences, searchableListings]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("user.greeting", { name })}</h1>
          <p className="text-sm text-neutral-500">{t("user.overviewSubtitle")}</p>
        </div>
        <Link
          href="/search"
          className="shrink-0 rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-600"
        >
          {t("user.newSavedSearch")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("user.statSavedProperties")} value={savedListingsCount} icon={Bookmark} />
        <StatCard label={t("user.statSavedProjects")} value={savedProjectsCount} icon={Bookmark} />
        <StatCard label={t("user.statSavedSearches")} value={savedSearches.length} icon={SquareStack} />
        <StatCard label={t("user.statActiveAlerts")} value={unreadAlerts} icon={Bell} />
      </div>

      {recentListings.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("user.recentlyViewed")}</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto scroll-thin pb-1">
            {recentListings.map((l) => (
              <Link
                key={l.id}
                href={`/listing/${l.slug}`}
                className="w-44 shrink-0 overflow-hidden rounded-card border border-neutral-200 bg-white hover:border-neutral-300"
              >
                <div className="relative aspect-[4/3] w-full">
                  <PlaceholderImage seed={l.id} kind="hero" className="h-full w-full" />
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-neutral-800">{l.title}</p>
                  <p className="text-xs text-neutral-500">{priceFmt(l.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {savedSearches.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("saved.savedSearches")}</h2>
          <div className="mt-3 space-y-2">
            {savedSearches.slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-card border border-neutral-200 bg-white p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
                  <p className="text-xs text-neutral-500">{s.filtersSummary || t("saved.allProperties")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium capitalize text-neutral-600">
                    <Bell className="h-3.5 w-3.5" />
                    {s.cadence}
                  </span>
                  <button
                    onClick={() => removeSavedSearch(s.id)}
                    aria-label={t("saved.removeSavedSearch")}
                    className="rounded-control p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {priceAlerts.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("user.priceAlerts")}</h2>
          <div className="mt-3">
            <NotificationsList
              items={priceAlerts}
              readIds={notificationReadIds}
              onMarkRead={onMarkNotificationRead}
              onMarkAllRead={onMarkAllNotificationsRead}
            />
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("user.recommendedForYou")}</h2>
          <p className="text-xs text-neutral-400">{t("user.recommendedNote")}</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recommended.map((l) => (
              <ListingCard key={l.id} listing={l} variant="grid" />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function SavedTab({ listings, projects }: { listings: Listing[]; projects: Project[] }) {
  const { t } = useT();
  const isEmpty = listings.length === 0 && projects.length === 0;
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-xl text-neutral-900">{t("user.tabSaved")}</h1>
      {isEmpty && (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          {t("saved.nothingSavedYet")}
        </p>
      )}
      {projects.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("saved.projects")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}
      {listings.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("saved.listings")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} variant="grid" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CompareTab({ items }: { items: CompareEntity[] }) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("user.tabCompare")}</h1>
      {items.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          {t("compare.hintNone")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item, i) => {
            const title = item.kind === "listing" ? item.entity.title : `${item.projectName} — ${item.entity.code}`;
            const price = item.entity.price;
            const href = item.kind === "listing" ? `/listing/${item.entity.slug}` : `/project/${item.projectSlug}?unit=${item.entity.id}`;
            return (
              <div key={i} className="flex items-center gap-3 rounded-panel border border-neutral-200 bg-white p-3.5">
                <PlaceholderImage seed={`${item.kind}-${i}`} kind="hero" className="h-14 w-20 shrink-0 rounded-card" />
                <div className="min-w-0 flex-1">
                  <Link href={href} className="truncate text-sm font-semibold text-neutral-900 hover:text-brand-600">
                    {title}
                  </Link>
                  <p className="text-xs text-neutral-500">{priceFmt(price)}</p>
                </div>
                <button
                  onClick={() => removeCompareAt(i)}
                  aria-label={t("compare.removeFromCompareShort")}
                  className="shrink-0 rounded-control p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecentTab({
  entries,
  searchableListings,
  projects,
}: {
  entries: RecentlyViewedEntry[];
  searchableListings: Listing[];
  projects: Project[];
}) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const clearRecentlyViewed = useAppStore((s) => s.clearRecentlyViewed);

  const resolved = useMemo(
    () =>
      entries
        .map((e) => {
          if (e.kind === "listing") {
            const listing = searchableListings.find((l) => l.id === e.id);
            return listing ? { entry: e, title: listing.title, price: listing.price, href: `/listing/${listing.slug}` } : null;
          }
          const project = projects.find((p) => p.id === e.id);
          return project ? { entry: e, title: project.name, price: undefined, href: `/project/${project.slug}` } : null;
        })
        .filter((v): v is NonNullable<typeof v> => !!v),
    [entries, searchableListings, projects]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl text-neutral-900">{t("user.tabRecent")}</h1>
        {resolved.length > 0 && (
          <button onClick={clearRecentlyViewed} className="text-xs font-semibold text-brand-600 hover:underline">
            {t("user.clearRecent")}
          </button>
        )}
      </div>
      {resolved.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          {t("user.noRecentlyViewed")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {resolved.map(({ entry, title, price, href }) => (
            <Link
              key={`${entry.kind}-${entry.id}`}
              href={href}
              className="flex items-center gap-3 rounded-panel border border-neutral-200 bg-white p-3.5 hover:border-neutral-300"
            >
              <PlaceholderImage seed={entry.id} kind="hero" className="h-14 w-20 shrink-0 rounded-card" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{title}</p>
                {price != null && <p className="text-xs text-neutral-500">{priceFmt(price)}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PreferencesTab({ preferences }: { preferences: BuyerPreferences }) {
  const { t, locale } = useT();
  const updateBuyerPreferences = useAppStore((s) => s.updateBuyerPreferences);
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];

  const [transaction, setTransaction] = useState(preferences.transaction);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>(preferences.propertyTypes);
  const [maxPrice, setMaxPrice] = useState(preferences.priceMax != null ? String(preferences.priceMax) : "");
  const [location, setLocation] = useState(preferences.location);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    updateBuyerPreferences({
      transaction,
      propertyTypes,
      priceMax: maxPrice ? Number(maxPrice) : null,
      location,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("buyer.preferencesTitle")}</h1>
      <div className="max-w-lg space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">
            {t("buyer.transactionLabel")}
          </span>
          <div className="grid grid-cols-2 gap-2 rounded-control bg-neutral-100 p-1">
            {(["buy", "rent"] as const).map((txn) => (
              <button
                key={txn}
                onClick={() => setTransaction(txn)}
                className={cn(
                  "rounded-[10px] py-2 text-sm font-semibold transition-colors",
                  transaction === txn ? "bg-white text-neutral-900 shadow-[var(--shadow-1)]" : "text-neutral-500 hover:text-neutral-700"
                )}
              >
                {txn === "buy" ? t("nav.buy") : t("nav.rent")}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">
            {t("buyer.propertyTypesLabel")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PROPERTY_TYPES.map((pt) => (
              <button
                key={pt}
                onClick={() => setPropertyTypes((v) => toggle(v, pt))}
                aria-pressed={propertyTypes.includes(pt)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
                  propertyTypes.includes(pt)
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                )}
              >
                {propertyTypeLabels[pt]}
              </button>
            ))}
          </div>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("buyer.maxPriceLabel")}
            </span>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("buyer.locationLabel")}
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
        </div>

        <button
          onClick={handleSave}
          className="rounded-control bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t("buyer.savePreferences")}
        </button>
        {saved && (
          <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            {t("buyer.preferencesSaved")}
          </p>
        )}
      </div>
    </div>
  );
}

interface InvitationRow {
  id: string;
  role: string;
  organization: { id: string; name: string; type: string; logoUrl: string | null };
}

const INVITATION_ROLE_LABEL_KEY: Record<string, string> = {
  owner: "team.roleOwner",
  admin: "team.roleAdmin",
  agent: "team.roleAgent",
  content_editor: "team.roleContentEditor",
  viewer: "team.roleViewer",
};

/** §14.4 "Business invitation" flow — a pending organization invitation
 * addressed to the signed-in account's own email. Accepting creates the
 * real `OrganizationMembership` row server-side, then calls next-auth's
 * `update()` (re-runs the `jwt` callback's `trigger === "update"` branch
 * in src/auth.ts) so the session actually carries the new
 * role/publisherId/orgRole without forcing a sign-out/sign-in. */
function PendingInvitations() {
  const { t } = useT();
  const { update: updateSession } = useSession();
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/invitations")
      .then((r) => (r.ok ? r.json() : []))
      .then(setInvitations)
      .catch(() => {});
  }, []);

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    const res = await fetch(`/api/account/invitations/${id}`, { method: accept ? "POST" : "DELETE" });
    setBusyId(null);
    if (res.ok) {
      setInvitations((v) => v.filter((i) => i.id !== id));
      if (accept) {
        await updateSession();
        window.location.reload();
      }
    }
  }

  if (invitations.length === 0) return null;

  return (
    <div className="space-y-2 rounded-panel border border-brand-200 bg-brand-50/50 p-4">
      {invitations.map((inv) => (
        <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-800">
            {t("buyer.invitationText", {
              org: inv.organization.name,
              role: t(INVITATION_ROLE_LABEL_KEY[inv.role] ?? "team.roleViewer"),
            })}
          </p>
          <div className="flex gap-2">
            <button
              disabled={busyId === inv.id}
              onClick={() => respond(inv.id, true)}
              className="rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {t("buyer.acceptInvitation")}
            </button>
            <button
              disabled={busyId === inv.id}
              onClick={() => respond(inv.id, false)}
              className="rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {t("buyer.declineInvitation")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface AccountProfile {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  country: string | null;
  preferredLanguage: string | null;
  preferredCurrency: string | null;
  preferredContactMethod: string | null;
  cityLocationId: string | null;
  cityLocation: { id: string; officialName: string } | null;
}

interface LocationOption {
  id: string;
  officialName: string;
  cityName: string;
}

const CONTACT_METHODS = ["phone", "email", "whatsapp"] as const;
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "sq", label: "Shqip" },
];
const CURRENCIES = [
  { value: "EUR", label: "EUR (€)" },
  { value: "ALL", label: "ALL (L)" },
];

/** Real Account & Profile System profile form (Account & Profile System
 * PRD v1.0 §4) — reads/writes `/api/account/profile`, the signed-in
 * account's real Postgres `User` row, instead of the local-only mock
 * `buyerProfile`. Required-field asterisks come from the same admin
 * `FieldPolicy` map the server enforces (§11.4 "Backend enforcement" —
 * the server re-checks these regardless of what this form shows). */
function ProfileTab() {
  const { t } = useT();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [required, setRequired] = useState<Record<string, boolean>>({});
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setProfile(data.profile);
        setRequired(data.requiredFields ?? {});
        setForm({
          firstName: data.profile.firstName ?? "",
          lastName: data.profile.lastName ?? "",
          phone: data.profile.phone ?? "",
          country: data.profile.country ?? "",
          preferredLanguage: data.profile.preferredLanguage ?? "",
          preferredCurrency: data.profile.preferredCurrency ?? "",
          preferredContactMethod: data.profile.preferredContactMethod ?? "",
          cityLocationId: data.profile.cityLocationId ?? "",
        });
      })
      .catch(() => {});
    fetch("/api/locations?type=neighborhood")
      .then((r) => (r.ok ? r.json() : []))
      .then(setLocations)
      .catch(() => {});
  }, []);

  function isRequired(key: string) {
    return required[`standard_user.${key}`] ?? false;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("buyer.profileSaveFailed"));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-xl text-neutral-900">{t("buyer.profileTitle")}</h1>
        <p className="text-sm text-neutral-400">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("buyer.profileTitle")}</h1>
      <div className="grid max-w-lg grid-cols-1 gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <ProfileField
          label={t("buyer.firstNameLabel")}
          required={isRequired("firstName")}
          value={form.firstName}
          onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
        />
        <ProfileField
          label={t("buyer.lastNameLabel")}
          required={isRequired("lastName")}
          value={form.lastName}
          onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
        />
        <div className="sm:col-span-2">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            {t("buyer.emailLabel")}
            {profile.emailVerified && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600">
                <CheckCircle2 className="h-3 w-3" /> {t("admin.verified")}
              </span>
            )}
          </span>
          <input
            disabled
            value={profile.email ?? ""}
            className="w-full rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
          />
        </div>
        <div>
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            {t("buyer.phoneLabel")}
            {isRequired("phone") && <span className="text-brand-500">*</span>}
            {profile.phoneVerifiedAt && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600">
                <CheckCircle2 className="h-3 w-3" /> {t("admin.verified")}
              </span>
            )}
          </span>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        <ProfileField
          label={t("buyer.countryLabel")}
          required={isRequired("country")}
          value={form.country}
          onChange={(v) => setForm((f) => ({ ...f, country: v }))}
        />
        <ProfileSelect
          label={t("buyer.cityLabel")}
          required={isRequired("cityLocationId")}
          value={form.cityLocationId}
          onChange={(v) => setForm((f) => ({ ...f, cityLocationId: v }))}
          options={[{ value: "", label: t("common.any") }, ...locations.map((l) => ({ value: l.id, label: l.officialName }))]}
        />
        <ProfileSelect
          label={t("buyer.languageLabel")}
          required={isRequired("preferredLanguage")}
          value={form.preferredLanguage}
          onChange={(v) => setForm((f) => ({ ...f, preferredLanguage: v }))}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
        />
        <ProfileSelect
          label={t("buyer.currencyLabel")}
          required={isRequired("preferredCurrency")}
          value={form.preferredCurrency}
          onChange={(v) => setForm((f) => ({ ...f, preferredCurrency: v }))}
          options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
        />
        <ProfileSelect
          label={t("buyer.contactMethodLabel")}
          required={isRequired("preferredContactMethod")}
          value={form.preferredContactMethod}
          onChange={(v) => setForm((f) => ({ ...f, preferredContactMethod: v }))}
          options={[
            { value: "", label: t("common.any") },
            ...CONTACT_METHODS.map((m) => ({ value: m, label: t(`buyer.contactMethod.${m}`) })),
          ]}
        />
      </div>
      <button
        disabled={saving}
        onClick={handleSave}
        className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? t("common.loading") : t("buyer.saveProfile")}
      </button>
      {saved && (
        <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700 max-w-lg">
          {t("buyer.profileSaved")}
        </p>
      )}
      {error && (
        <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700 max-w-lg">{error}</p>
      )}
    </div>
  );
}

function ProfileField({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">
        {label}
        {required && <span className="ml-0.5 text-brand-500">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      />
    </label>
  );
}

function ProfileSelect({
  label,
  required,
  value,
  onChange,
  options,
}: {
  label: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">
        {label}
        {required && <span className="ml-0.5 text-brand-500">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const IDENTITY_STATUS_LABEL_KEY: Record<string, string> = {
  not_required: "buyer.identityNotRequested",
  pending: "buyer.identityPending",
  verified: "buyer.identityVerified",
  failed: "buyer.identityFailed",
  expired: "buyer.identityExpired",
};

/** §9 "Verification & Trust — Identity" — real self-service request +
 * real admin manual review (no automated KYC provider in this
 * environment). Requesting this is what unlocks the "Verified Publisher"
 * badge for a Private Publisher, but any signed-in account can request
 * it from here. */
function IdentityVerificationCard() {
  const { t } = useT();
  const [status, setStatus] = useState<{
    identityVerificationStatus: string;
    identityRejectionReason: string | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch("/api/account/identity-verification")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }
  useEffect(load, []);

  async function submit() {
    setSubmitting(true);
    const res = await fetch("/api/account/identity-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      setNote("");
      load();
    }
  }

  if (!status) return null;
  const canRequest =
    status.identityVerificationStatus === "not_required" ||
    status.identityVerificationStatus === "failed" ||
    status.identityVerificationStatus === "expired";

  return (
    <div className="max-w-lg space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-neutral-900">{t("buyer.identityVerificationTitle")}</h2>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            status.identityVerificationStatus === "verified"
              ? "bg-green-100 text-green-700"
              : status.identityVerificationStatus === "pending"
                ? "bg-amber-50 text-amber-700"
                : status.identityVerificationStatus === "failed"
                  ? "bg-red-50 text-red-700"
                  : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {t(IDENTITY_STATUS_LABEL_KEY[status.identityVerificationStatus] ?? "buyer.identityNotRequested")}
        </span>
      </div>
      <p className="text-xs text-neutral-500">{t("buyer.identityVerificationBody")}</p>
      {status.identityVerificationStatus === "failed" && status.identityRejectionReason && (
        <p className="rounded-control bg-red-50 px-3 py-2 text-xs text-red-700">
          {t("company.verificationRejectionReason", { reason: status.identityRejectionReason })}
        </p>
      )}
      {canRequest && (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("buyer.identityNotePlaceholder")}
            rows={2}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <button
            disabled={submitting}
            onClick={submit}
            className="rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? t("common.loading") : t("buyer.requestIdentityVerification")}
          </button>
        </>
      )}
    </div>
  );
}

/** §10.1 "Change password" + "Active sessions/devices" + "Sign out all
 * other sessions" — real bcrypt password change + real `Session` rows. */
function SecurityTab() {
  const { t, locale } = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sessions, setSessions] = useState<{ id: string; expires: string }[]>([]);

  useEffect(() => {
    fetch("/api/account/security/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSessions(data?.sessions ?? []))
      .catch(() => {});
  }, []);

  async function handleChangePassword() {
    setChanging(true);
    setPasswordMsg(null);
    const res = await fetch("/api/account/security/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setChanging(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setPasswordMsg({ ok: false, text: body?.error ?? t("buyer.passwordChangeFailed") });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordMsg({ ok: true, text: t("buyer.passwordChanged") });
  }

  async function revokeSession(id: string) {
    await fetch(`/api/account/security/sessions?sessionId=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSessions((s) => s.filter((row) => row.id !== id));
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-xl text-neutral-900">{t("buyer.tabSecurity")}</h1>

      <div className="max-w-lg space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("buyer.changePasswordTitle")}</h2>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("buyer.currentPasswordLabel")}</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("buyer.newPasswordLabel")}</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <button
          disabled={changing || !currentPassword || newPassword.length < 8}
          onClick={handleChangePassword}
          className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {changing ? t("common.loading") : t("buyer.changePasswordCta")}
        </button>
        {passwordMsg && (
          <p
            className={`rounded-control px-3 py-2 text-xs font-medium ${
              passwordMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {passwordMsg.text}
          </p>
        )}
      </div>

      <div className="max-w-lg space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-bold text-neutral-900">{t("buyer.activeSessionsTitle")}</h2>
        </div>
        {sessions.length === 0 ? (
          <p className="text-xs text-neutral-400">{t("buyer.noOtherSessions")}</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-control border border-neutral-100 p-2.5">
                <p className="text-xs text-neutral-600">
                  {t("buyer.sessionExpires", {
                    date: new Date(s.expires).toLocaleString(locale === "sq" ? "sq-AL" : "en-US"),
                  })}
                </p>
                <button
                  onClick={() => revokeSession(s.id)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  {t("buyer.signOutSession")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** §10.2 "Privacy controls" — real, revocable, versioned marketing
 * consent toggle. Data export/account deletion shown as an honest
 * "contact support" step (no automated pipeline behind them yet). */
function PrivacyTab() {
  const { t } = useT();
  const [profile, setProfile] = useState<{ marketingConsent: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setProfile({ marketingConsent: data.profile.marketingConsent }))
      .catch(() => {});
  }, []);

  async function toggleConsent(next: boolean) {
    setSaving(true);
    const res = await fetch("/api/account/consent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingConsent: next }),
    });
    setSaving(false);
    if (res.ok) setProfile({ marketingConsent: next });
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: deletePassword }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setDeleteError(body?.error ?? t("buyer.deleteAccountFailed"));
      setDeleting(false);
      return;
    }
    await signOut({ callbackUrl: "/" });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-xl text-neutral-900">{t("buyer.tabPrivacy")}</h1>

      <div className="max-w-lg space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">{t("buyer.marketingConsentTitle")}</p>
            <p className="text-xs text-neutral-500">{t("buyer.marketingConsentBody")}</p>
          </div>
          <button
            disabled={saving || !profile}
            onClick={() => profile && toggleConsent(!profile.marketingConsent)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
              profile?.marketingConsent ? "bg-green-600 text-white hover:bg-green-700" : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
            }`}
          >
            {profile?.marketingConsent ? t("admin.flagOn") : t("admin.flagOff")}
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">{t("buyer.profileNotSearchableNote")}</p>
      </div>

      <div className="max-w-lg space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("buyer.dataExportTitle")}</h2>
        <p className="text-xs text-neutral-500">{t("buyer.dataExportBody")}</p>
        <a
          href="/api/account/export"
          className="inline-block rounded-control bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {t("buyer.downloadMyData")}
        </a>
      </div>

      <div className="max-w-lg space-y-3 rounded-panel border border-red-200 bg-red-50/30 p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("buyer.deleteAccountTitle")}</h2>
        <p className="text-xs text-neutral-500">{t("buyer.deleteAccountBody")}</p>
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-control border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            {t("buyer.deleteAccountCta")}
          </button>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("buyer.deleteAccountPasswordLabel")}
              </span>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                disabled={deleting || !deletePassword}
                onClick={handleDelete}
                className="rounded-control bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("common.loading") : t("buyer.confirmDeleteAccount")}
              </button>
              <button
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeletePassword("");
                  setDeleteError(null);
                }}
                className="rounded-control border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                {t("common.cancel")}
              </button>
            </div>
            {deleteError && <p className="text-xs font-medium text-red-700">{deleteError}</p>}
          </div>
        )}
        <p className="text-[11px] text-neutral-400">{t("buyer.deleteAccountNote")}</p>
      </div>
    </div>
  );
}
