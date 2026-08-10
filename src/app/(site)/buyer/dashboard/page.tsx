"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, LayoutList, MessageCircle, Settings, User } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { listings, getNeighborhood } from "@/lib/mockData";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { ListingCard } from "@/components/results/ListingCard";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import type { BuyerPreferences, Listing, PropertyType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "feed", labelKey: "buyer.tabFeed", icon: LayoutList },
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

export default function BuyerDashboardPage() {
  const auth = useAppStore((s) => s.auth);
  const buyerProfile = useAppStore((s) => s.buyerProfile);
  const conversations = useAppStore((s) => s.conversations);
  const { t } = useT();
  const [tab, setTab] = useState<TabId>("feed");

  const isBuyer = auth.signedIn && auth.role === "buyer" && buyerProfile;

  if (!isBuyer) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Heart className="h-10 w-10 text-brand-500" />
        <h1 className="font-serif text-xl text-neutral-900">{t("buyer.signInRequiredTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("buyer.signInRequiredBody")}</p>
        <Link
          href="/buyer/signup"
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {t("buyer.becomeABuyer")}
        </Link>
      </div>
    );
  }

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
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {tab === "feed" && <FeedTab preferences={buyerProfile.preferences} />}
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

function FeedTab({ preferences }: { preferences: BuyerPreferences }) {
  const { t } = useT();
  const matches = useMemo(
    () =>
      listings
        .filter((l) => matchesPreferences(l, preferences))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [preferences]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("buyer.feedTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("buyer.feedSubtitle")}</p>
      </div>
      {matches.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          {t("buyer.feedEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {matches.map((l) => (
            <ListingCard key={l.id} listing={l} variant="grid" />
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
