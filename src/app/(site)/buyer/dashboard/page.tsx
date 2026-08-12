"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { listings, projects, searchableListings, getNeighborhood } from "@/lib/mockData";
import { buyerNotifications } from "@/lib/mockActivity";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { ListingCard } from "@/components/results/ListingCard";
import { ProjectCard } from "@/components/results/ProjectCard";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { NotificationsList } from "@/components/dashboard/NotificationsList";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useHasMounted } from "@/hooks/useHasMounted";
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
 * (saved.*, savedSearches, compare, recentlyViewed, readNotificationIds) so
 * every one of these views always agrees with each other. */
export default function BuyerDashboardPage() {
  const auth = useAppStore((s) => s.auth);
  const openSignIn = useAppStore((s) => s.openSignIn);
  const buyerProfile = useAppStore((s) => s.buyerProfile);
  const conversations = useAppStore((s) => s.conversations);
  const saved = useAppStore((s) => s.saved);
  const savedSearches = useAppStore((s) => s.savedSearches);
  const compare = useAppStore((s) => s.compare);
  const recentlyViewed = useAppStore((s) => s.recentlyViewed);
  const readNotificationIds = useAppStore((s) => s.readNotificationIds);
  const mounted = useHasMounted();
  const { t } = useT();
  const [tab, setTab] = useState<TabId>("overview");

  const isBuyer = auth.signedIn && auth.role === "buyer" && buyerProfile;
  const notifications = useMemo(() => buyerNotifications(), []);
  const unreadCount = notifications.filter((n) => !readNotificationIds.includes(n.id)).length;

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

  const savedListings = listings.filter((l) => saved.listings.includes(l.id));
  const savedProjects = projects.filter((p) => saved.projects.includes(p.id));
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
          />
        )}
        {tab === "saved" && <SavedTab listings={savedListings} projects={savedProjects} />}
        {tab === "compare" && <CompareTab items={compare} />}
        {tab === "recent" && <RecentTab entries={recentlyViewed} />}
        {tab === "alerts" && (
          <div className="space-y-4">
            <h1 className="font-serif text-xl text-neutral-900">{t("user.tabAlerts")}</h1>
            <NotificationsList items={notifications} />
          </div>
        )}
        {tab === "messages" && (
          <div className="space-y-4">
            <h1 className="font-serif text-xl text-neutral-900">{t("buyer.tabMessages")}</h1>
            <MessagesPanel conversations={myConversations} viewerId={buyerProfile.id} />
          </div>
        )}
        {tab === "preferences" && <PreferencesTab preferences={buyerProfile.preferences} />}
        {tab === "profile" && <ProfileTab />}
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
}: {
  name: string;
  savedListingsCount: number;
  savedProjectsCount: number;
  savedSearches: SavedSearch[];
  recentlyViewed: RecentlyViewedEntry[];
  unreadAlerts: number;
  preferences: BuyerPreferences;
  priceAlerts: NotificationItem[];
}) {
  const { t } = useT();
  const priceFmt = usePriceFormat();

  const recentListings = useMemo(
    () =>
      recentlyViewed
        .filter((e) => e.kind === "listing")
        .map((e) => searchableListings.find((l) => l.id === e.id))
        .filter((l): l is Listing => !!l)
        .slice(0, 8),
    [recentlyViewed]
  );

  const recommended = useMemo(
    () =>
      listings
        .filter((l) => matchesPreferences(l, preferences))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3),
    [preferences]
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
                <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium capitalize text-neutral-600">
                  <Bell className="h-3.5 w-3.5" />
                  {s.cadence}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {priceAlerts.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-neutral-900">{t("user.priceAlerts")}</h2>
          <div className="mt-3">
            <NotificationsList items={priceAlerts} />
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

function RecentTab({ entries }: { entries: RecentlyViewedEntry[] }) {
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
    [entries]
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

function ProfileTab() {
  const { t } = useT();
  const buyerProfile = useAppStore((s) => s.buyerProfile);
  const setBuyerProfile = useAppStore((s) => s.setBuyerProfile);
  const [name, setName] = useState(buyerProfile?.name ?? "");
  const [email, setEmail] = useState(buyerProfile?.email ?? "");
  const [phone, setPhone] = useState(buyerProfile?.phone ?? "");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!buyerProfile) return;
    setBuyerProfile({ ...buyerProfile, name, email, phone });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("buyer.profileTitle")}</h1>
      <div className="grid max-w-lg grid-cols-1 gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("buyer.nameLabel")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("buyer.emailLabel")}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("buyer.phoneLabel")}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
      </div>
      <button
        onClick={handleSave}
        className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
      >
        {t("buyer.saveProfile")}
      </button>
      {saved && (
        <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700 max-w-lg">
          {t("buyer.profileSaved")}
        </p>
      )}
    </div>
  );
}
