"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Home,
  Camera,
  MessageCircle,
  BarChart3,
  Megaphone,
  User,
  HelpCircle,
  Eye,
  Heart,
  MessageSquare,
  Phone,
  Upload,
  ShieldCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useUrlTab } from "@/hooks/useUrlTab";
import { usePublisherListings } from "@/hooks/usePublisherListings";
import { useAccountNotifications } from "@/hooks/useAccountNotifications";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { NewListingForm } from "@/components/dashboard/NewListingForm";
import { NotificationsList } from "@/components/dashboard/NotificationsList";
import { formatRelativeDate, cn } from "@/lib/utils";
import type { Listing, Publisher } from "@/lib/types";

const TABS = [
  { id: "overview", labelKey: "privatePublisher.navOverview", icon: LayoutDashboard },
  { id: "listing", labelKey: "privatePublisher.navMyListing", icon: Home },
  { id: "media", labelKey: "privatePublisher.navMedia", icon: Camera },
  { id: "inquiries", labelKey: "privatePublisher.navInquiries", icon: MessageCircle },
  { id: "performance", labelKey: "privatePublisher.navPerformance", icon: BarChart3 },
  { id: "promotion", labelKey: "privatePublisher.navPromotion", icon: Megaphone },
  { id: "account", labelKey: "privatePublisher.navAccount", icon: User },
  { id: "help", labelKey: "privatePublisher.navHelp", icon: HelpCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Deterministic mock performance numbers, same technique the Business
// Publisher dashboard uses — a real backend would replace this with actual
// counters.
function metricHash(id: string, salt: number): number {
  const s = `${id}-${salt}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function performanceFor(id: string) {
  return {
    views: 180 + (metricHash(id, 1) % 2400),
    saves: 4 + (metricHash(id, 2) % 90),
    whatsapp: 2 + (metricHash(id, 3) % 40),
    phone: 1 + (metricHash(id, 4) % 22),
  };
}

// PRD_ROZARIS_User_Types §3 "Listing workflow": Draft → Incomplete →
// Pending Review → Changes Requested → Approved → Published → Paused/
// Archived, with "current status and required next action always visible."
const STAGE_ORDER = [
  "draft",
  "incomplete",
  "pendingReview",
  "changesRequested",
  "approved",
  "published",
  "archived",
] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STAGE_LABEL_KEY: Record<Stage, string> = {
  draft: "privatePublisher.stageDraft",
  incomplete: "privatePublisher.stageIncomplete",
  pendingReview: "privatePublisher.stagePendingReview",
  changesRequested: "privatePublisher.stageChangesRequested",
  approved: "privatePublisher.stageApproved",
  published: "privatePublisher.stagePublished",
  archived: "privatePublisher.stageArchived",
};

/** Maps this app's actual Listing.status onto the PRD's fuller lifecycle
 * stepper. `pending` (real since `POST /api/listings` started creating
 * real rows — see the "Rozaris Platform Audit" memory) maps cleanly onto
 * "pendingReview". `draft` (the "location drop" requirement — a listing
 * with no confirmed location stays here until the publisher adds one and
 * resubmits, or an admin approves it without one) is now real too; there's
 * still no distinct "approved" status in the data model, so that one stage
 * remains unreachable from a real listing. */
function stageForStatus(status: Listing["status"]): Stage {
  switch (status) {
    case "draft":
      return "draft";
    case "pending":
      return "pendingReview";
    case "active":
    case "sold":
    case "rented":
      return "published";
    case "suspended":
    case "rejected":
      return "changesRequested";
    case "expired":
    case "archived":
      return "archived";
  }
}

function WorkflowStepper({ status }: { status: Listing["status"] }) {
  const { t } = useT();
  const currentIndex = STAGE_ORDER.indexOf(stageForStatus(status));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGE_ORDER.map((stage, i) => (
        <span
          key={stage}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            i === currentIndex
              ? "bg-brand-500 text-white"
              : i < currentIndex
              ? "bg-neutral-200 text-neutral-500"
              : "bg-neutral-100 text-neutral-400"
          )}
        >
          {t(STAGE_LABEL_KEY[stage])}
        </span>
      ))}
    </div>
  );
}

/** Computed, not hardcoded — PRD_ROZARIS_User_Types §3 shows a "92%,
 * Listing Completeness" ring; this counts how many of a listing's
 * meaningfully-optional-for-completeness fields are actually filled. */
function listingCompleteness(listing: Listing): number {
  const checks = [
    !!listing.title,
    !!listing.description?.en && !!listing.description?.sq,
    listing.images.length >= 3,
    !!listing.floorPlanImage,
    !!listing.facadeImage,
    listing.amenities.length > 0,
    !!listing.videoUrl,
    listing.price > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Private Publisher Dashboard (PRD_ROZARIS_User_Types §3) — deliberately
 * simpler than BusinessPublisherDashboard in dashboard/page.tsx: one active
 * listing, no Projects/Inventory/Leads-pipeline/Company-team modules. A
 * real, separate component tree (not the business dashboard with items
 * hidden) per the PRD's "Final Platform Rule". */
export function PrivatePublisherDashboard({ publisher }: { publisher: Publisher }) {
  const [tab, setTab] = useUrlTab<TabId>("/dashboard", TABS.map((tb) => tb.id), "overview");
  const { t } = useT();
  // Single-listing rule (PRD §3): whichever real listing landed on this
  // publisher is treated as "the" listing; any further ones stay in the
  // underlying data as historical/archived, never surfaced as a second
  // active listing here.
  const { listings: myListings, refresh: refreshListing } = usePublisherListings(publisher.id);
  const myListing = myListings?.[0] ?? null;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <div className="mb-4 flex items-center gap-3 rounded-panel border border-neutral-200 bg-white p-3.5">
          <PlaceholderImage
            seed={publisher.id}
            kind="avatar"
            className="h-10 w-10 rounded-xl"
            iconClassName="h-4 w-4"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{publisher.name}</p>
            <p className="text-xs text-neutral-500">{t("publisher.typePrivateOwner")}</p>
          </div>
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
        {tab === "overview" && <OverviewTab publisher={publisher} listing={myListing} onManage={() => setTab("listing")} />}
        {tab === "listing" && (
          <MyListingTab listing={myListing} publisherId={publisher.id} onSaved={refreshListing} />
        )}
        {tab === "media" && <MediaTab />}
        {tab === "inquiries" && <InquiriesTab publisher={publisher} />}
        {tab === "performance" && <PerformanceTab listing={myListing} />}
        {tab === "promotion" && <PromotionTab listing={myListing} />}
        {tab === "account" && <AccountTab publisher={publisher} />}
        {tab === "help" && <HelpTab />}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Eye }) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4">
      <Icon className="h-4.5 w-4.5 text-brand-500" />
      <p className="mt-2 text-xl font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function OverviewTab({
  publisher,
  listing,
  onManage,
}: {
  publisher: Publisher;
  listing: Listing | null;
  onManage: () => void;
}) {
  const { t, locale } = useT();
  const priceFmt = usePriceFormat();
  // Real `Notification` rows for the signed-in account, same as the
  // buyer/business dashboards — replaces `publisherNotifications()`,
  // which regenerated fake notifications every session (launch-readiness
  // audit finding).
  const { notifications: allNotifications, readIds, markRead, markAllRead } = useAccountNotifications();
  const notifications = useMemo(() => allNotifications.slice(0, 3), [allNotifications]);
  const perf = listing ? performanceFor(listing.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">
          {t("privatePublisher.greeting", { name: publisher.name.split(" ")[0] })}
        </h1>
        <p className="text-sm text-neutral-500">{t("privatePublisher.overviewSubtitle")}</p>
      </div>

      {!listing ? (
        <EmptyListingCard />
      ) : (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white sm:flex">
          <div className="relative h-44 w-full shrink-0 sm:h-auto sm:w-56">
            <PlaceholderImage seed={listing.id} kind="hero" className="h-full w-full" watermark />
          </div>
          <div className="flex-1 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <WorkflowStepper status={listing.status} />
                <p className="mt-2 font-serif text-lg text-neutral-900">{listing.title}</p>
                <p className="text-xs text-neutral-500">
                  {t("privatePublisher.listedOn", { date: formatRelativeDate(listing.createdAt, locale) })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-neutral-900">{priceFmt(listing.price)}</p>
                <p className="mt-1 text-xs font-semibold text-brand-600">
                  {t("privatePublisher.completeness", { percent: listingCompleteness(listing) })}
                </p>
              </div>
            </div>
            {perf && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label={t("dashboard.analyticsViews")} value={perf.views} icon={Eye} />
                <StatCard label={t("dashboard.analyticsSaves")} value={perf.saves} icon={Heart} />
                <StatCard label={t("privatePublisher.statWhatsapp")} value={perf.whatsapp} icon={MessageSquare} />
                <StatCard label={t("privatePublisher.statPhone")} value={perf.phone} icon={Phone} />
              </div>
            )}
            <button
              onClick={onManage}
              className="mt-4 rounded-control bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              {t("privatePublisher.manageListing")}
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold text-neutral-900">{t("dashboard.notificationsTitle")}</h2>
        <NotificationsList items={notifications} readIds={readIds} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      </div>
    </div>
  );
}

function EmptyListingCard() {
  const { t } = useT();
  return (
    <div className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center">
      <Home className="mx-auto h-8 w-8 text-neutral-300" />
      <p className="mt-3 text-sm font-semibold text-neutral-700">{t("privatePublisher.noListingTitle")}</p>
      <p className="mt-1 text-xs text-neutral-400">{t("privatePublisher.noListingBody")}</p>
    </div>
  );
}

function MyListingTab({
  listing,
  publisherId,
  onSaved,
}: {
  listing: Listing | null;
  publisherId: string;
  onSaved: () => void;
}) {
  const { t, locale } = useT();
  const priceFmt = usePriceFormat();
  const [formOpen, setFormOpen] = useState(!listing);
  const [savedMessage, setSavedMessage] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navMyListing")}</h1>
          <p className="text-sm text-neutral-500">{t("privatePublisher.singleListingNote")}</p>
        </div>
        {listing && !formOpen && (
          <button
            onClick={() => setFormOpen(true)}
            className="rounded-control border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {t("dashboard.edit")}
          </button>
        )}
      </div>

      {savedMessage && (
        <p className="rounded-control bg-green-50 px-3.5 py-2.5 text-sm font-medium text-green-700">
          {t("dashboard.listingSavedConfirmation")}
        </p>
      )}

      {formOpen ? (
        <NewListingForm
          publisherId={publisherId}
          onSaved={() => {
            setFormOpen(false);
            setSavedMessage(true);
            onSaved();
            setTimeout(() => setSavedMessage(false), 3000);
          }}
          onCancel={() => setFormOpen(false)}
        />
      ) : listing ? (
        <div className="rounded-panel border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-4">
            <PlaceholderImage seed={listing.id} kind="hero" className="h-20 w-28 shrink-0 rounded-card" />
            <div className="min-w-0">
              <Link href={`/listing/${listing.slug}`} className="font-semibold text-neutral-900 hover:text-brand-600">
                {listing.title}
              </Link>
              <p className="text-sm text-neutral-500">{priceFmt(listing.price)}</p>
              <p className="text-xs text-neutral-400">
                {t("privatePublisher.listedOn", { date: formatRelativeDate(listing.createdAt, locale) })}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MediaTab() {
  const { t } = useT();
  const categories = [
    t("privatePublisher.mediaFloorPlans"),
    t("privatePublisher.mediaFrontBuilding"),
    t("privatePublisher.mediaInterior"),
    t("privatePublisher.mediaExterior"),
  ];
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navMedia")}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {categories.map((cat) => (
          <div
            key={cat}
            className="rounded-panel border border-dashed border-neutral-300 bg-white p-6 text-center"
          >
            <Upload className="mx-auto h-6 w-6 text-neutral-300" />
            <p className="mt-2 text-sm font-semibold text-neutral-700">{cat}</p>
            <button className="mt-3 rounded-control bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white">
              {t("dashboard.chooseFiles")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InquiriesTab({ publisher }: { publisher: Publisher }) {
  const { t } = useT();
  const conversations = useAppStore((s) => s.conversations);
  const myConversations = conversations.filter((c) => c.publisherId === publisher.id);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navInquiries")}</h1>
      <MessagesPanel conversations={myConversations} viewerId={publisher.id} />
    </div>
  );
}

function PerformanceTab({ listing }: { listing: Listing | null }) {
  const { t } = useT();
  if (!listing) return <EmptyListingCard />;
  const perf = performanceFor(listing.id);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navPerformance")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("dashboard.analyticsViews")} value={perf.views} icon={Eye} />
        <StatCard label={t("dashboard.analyticsSaves")} value={perf.saves} icon={Heart} />
        <StatCard label={t("privatePublisher.statWhatsapp")} value={perf.whatsapp} icon={MessageSquare} />
        <StatCard label={t("privatePublisher.statPhone")} value={perf.phone} icon={Phone} />
      </div>
    </div>
  );
}

function PromotionTab({ listing }: { listing: Listing | null }) {
  const { t } = useT();
  const packages = [
    { key: "standard", labelKey: "privatePublisher.promoStandard" },
    { key: "premium", labelKey: "privatePublisher.promoPremium" },
    { key: "featured", labelKey: "privatePublisher.promoFeatured" },
  ] as const;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navPromotion")}</h1>
      {!listing ? (
        <EmptyListingCard />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {packages.map((p) => (
            <div key={p.key} className="rounded-panel border border-neutral-200 bg-white p-4">
              <p className="text-sm font-bold text-neutral-900">{t(p.labelKey)}</p>
              <p className="mt-2 text-xs text-neutral-500">
                {listing.premium && p.key === "premium"
                  ? t("privatePublisher.promoActive")
                  : t("privatePublisher.promoInactive")}
              </p>
              <button className="mt-3 w-full rounded-control border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
                {t("privatePublisher.promoManage")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountTab({ publisher }: { publisher: Publisher }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navAccount")}</h1>
      <div className="grid grid-cols-1 gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <Field label={t("dashboard.displayName")} defaultValue={publisher.name} />
        <Field label={t("dashboard.phone")} defaultValue={publisher.phone} />
        <Field label={t("dashboard.whatsapp")} defaultValue={publisher.whatsapp} />
        <Field label={t("dashboard.publisherType")} defaultValue={t("publisher.typePrivateOwner")} disabled />
      </div>
      <button className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white">
        {t("dashboard.saveChanges")}
      </button>
    </div>
  );
}

function HelpTab() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("privatePublisher.navHelp")}</h1>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <ShieldCheck className="h-6 w-6 text-brand-500" />
        <p className="mt-2 text-sm text-neutral-600">{t("privatePublisher.helpBody")}</p>
        <Link
          href="/help"
          className="mt-3 inline-block rounded-control bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t("privatePublisher.goToHelp")}
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  disabled,
}: {
  label: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <input
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-400"
      />
    </label>
  );
}
