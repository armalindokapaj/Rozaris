"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  Camera,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  User,
  Plus,
  Upload,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  BarChart3,
  MousePointerClick,
  Heart,
  Crown,
  Boxes,
  HardHat,
  UserSquare2,
  Users,
  Table,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { projectsByDeveloper, getPublisherById, DEMO_PUBLISHER } from "@/lib/mockData";
import { usePublisherListings } from "@/hooks/usePublisherListings";
import { publisherNotifications } from "@/lib/mockActivity";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { ConstructionTimelineEditor } from "@/components/dashboard/ConstructionTimelineEditor";
import { NewListingForm } from "@/components/dashboard/NewListingForm";
import { PrivatePublisherDashboard } from "@/components/dashboard/PrivatePublisherDashboard";
import { NotificationsList } from "@/components/dashboard/NotificationsList";
import { LeadsTab } from "@/components/dashboard/business/LeadsTab";
import { InventoryTab } from "@/components/dashboard/business/InventoryTab";
import { ConstructionTab } from "@/components/dashboard/business/ConstructionTab";
import { ThreeDExperiencesTab } from "@/components/dashboard/business/ThreeDExperiencesTab";
import { CompanyProfileTab } from "@/components/dashboard/business/CompanyProfileTab";
import { cn } from "@/lib/utils";
import type { Listing, Publisher } from "@/lib/types";

const TABS = [
  { id: "overview", labelKey: "dashboard.tabOverview", icon: LayoutDashboard },
  { id: "projects", labelKey: "dashboard.tabProjects", icon: Building2 },
  { id: "inventory", labelKey: "dashboard.tabInventory", icon: Table },
  { id: "listings", labelKey: "dashboard.tabListings", icon: ListChecks },
  { id: "leads", labelKey: "dashboard.tabLeads", icon: Users },
  { id: "analytics", labelKey: "dashboard.tabAnalytics", icon: BarChart3 },
  { id: "construction", labelKey: "dashboard.tabConstruction", icon: HardHat },
  { id: "threeD", labelKey: "dashboard.tab3DExperiences", icon: Boxes },
  { id: "company", labelKey: "dashboard.tabCompanyProfile", icon: UserSquare2 },
  { id: "messages", labelKey: "dashboard.tabMessages", icon: MessageCircle },
  { id: "media", labelKey: "dashboard.tabMediaModels", icon: Camera },
  { id: "billing", labelKey: "dashboard.tabBillingPremium", icon: CreditCard },
  { id: "notifications", labelKey: "dashboard.tabNotifications", icon: Bell },
  { id: "profile", labelKey: "dashboard.tabProfile", icon: User },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Routes a signed-in publisher to the right dashboard shape for their
 * account type (PRD_ROZARIS_User_Types §3/§4) — Private Publisher gets an
 * intentionally simpler, single-listing workspace; Agency/Developer get the
 * fuller multi-project/multi-listing operational dashboard below. Never one
 * generic dashboard with sidebar items shown/hidden by role — the PRD's
 * "Final Platform Rule" — so this is a real branch to a different component
 * tree, not a conditional inside a shared one. */
export default function DashboardPage() {
  const auth = useAppStore((s) => s.auth);
  const openSignIn = useAppStore((s) => s.openSignIn);
  const { t } = useT();

  if (!auth.signedIn || auth.role !== "publisher") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.signInTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("dashboard.signInBody")}</p>
        <button
          onClick={openSignIn}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {t("dashboard.signInDemo")}
        </button>
      </div>
    );
  }

  const publisher: Publisher =
    (auth.publisherId ? getPublisherById(auth.publisherId) : undefined) ?? DEMO_PUBLISHER;

  if (auth.orgType === "private_owner") {
    return <PrivatePublisherDashboard publisher={publisher} />;
  }
  return <BusinessPublisherDashboard publisher={publisher} />;
}

function BusinessPublisherDashboard({ publisher }: { publisher: Publisher }) {
  const [tab, setTab] = useState<TabId>("overview");
  const { t } = useT();

  const { listings: myListings, refresh: refreshListings, deleteListing } = usePublisherListings(publisher.id);
  const myProjects = projectsByDeveloper(publisher.id);

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
            <p className="text-xs text-neutral-500">{t("dashboard.developerVerified")}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto scroll-thin lg:flex-col lg:overflow-visible">
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium",
                tab === id
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {tab === "overview" && (
          <OverviewTab listingCount={(myListings ?? []).length} projectCount={myProjects.length} />
        )}
        {tab === "projects" && <ProjectsTab projects={myProjects} />}
        {tab === "inventory" && <InventoryTab projects={myProjects} />}
        {tab === "listings" && (
          <ListingsTab
            listings={myListings ?? []}
            publisherId={publisher.id}
            onChanged={refreshListings}
            onDelete={deleteListing}
          />
        )}
        {tab === "leads" && <LeadsTab listings={myListings ?? []} projects={myProjects} />}
        {tab === "analytics" && <AnalyticsTab listings={myListings ?? []} projects={myProjects} />}
        {tab === "construction" && <ConstructionTab projects={myProjects} />}
        {tab === "threeD" && <ThreeDExperiencesTab projects={myProjects} />}
        {tab === "company" && <CompanyProfileTab publisher={publisher} />}
        {tab === "messages" && <MessagesTab publisher={publisher} />}
        {tab === "media" && <MediaTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "profile" && <ProfileTab publisher={publisher} />}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
}) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4">
      <Icon className="h-4.5 w-4.5 text-brand-500" />
      <p className="mt-2 text-xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function OverviewTab({
  listingCount,
  projectCount,
}: {
  listingCount: number;
  projectCount: number;
}) {
  const { t } = useT();
  const submissions = [
    [t("dashboard.submission1"), t("dashboard.statusApproved"), "text-green-600"],
    [t("dashboard.submission2"), t("dashboard.statusApproved"), "text-green-600"],
    [t("dashboard.submission3"), t("dashboard.statusChangesRequested"), "text-amber-600"],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.overviewTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("dashboard.overviewSubtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t("dashboard.statDrafts")} value={2} icon={Clock} />
        <StatCard label={t("dashboard.statPendingReview")} value={1} icon={MessageSquareWarning} />
        <StatCard label={t("dashboard.statPublished")} value={listingCount + projectCount} icon={CheckCircle2} />
        <StatCard label={t("dashboard.statChangesRequested")} value={1} icon={XCircle} />
        <StatCard label={t("dashboard.statExpired")} value={0} icon={Clock} />
        <StatCard label={t("dashboard.statLeadClicks")} value={57} icon={Eye} />
      </div>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("dashboard.recentSubmissions")}</h2>
        <ul className="mt-3 divide-y divide-neutral-100">
          {submissions.map(([title, status, color]) => (
            <li key={title} className="flex items-center justify-between py-3 text-sm">
              <span className="text-neutral-700">{title}</span>
              <span className={cn("font-semibold", color)}>{status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const LISTING_STATUS_STYLE: Record<Listing["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  archived: "bg-neutral-100 text-neutral-500",
  sold: "bg-neutral-100 text-neutral-500",
  rented: "bg-neutral-100 text-neutral-500",
  expired: "bg-neutral-100 text-neutral-500",
  suspended: "bg-red-100 text-red-700",
};

function ListingsTab({
  listings,
  publisherId,
  onChanged,
  onDelete,
}: {
  listings: Listing[];
  publisherId: string;
  onChanged: () => void;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const priceFmt = usePriceFormat();
  const { t } = useT();
  const [formOpen, setFormOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const statusLabel = (status: Listing["status"]) =>
    status === "active"
      ? t("dashboard.statusPublished")
      : status === "pending"
      ? t("dashboard.statusPendingReview")
      : t("dashboard.statusArchived");

  async function handleDelete(id: string) {
    if (!window.confirm(t("dashboard.confirmDeleteListing"))) return;
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.listingsTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("dashboard.listingsSubtitle")}</p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-control bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> {t("dashboard.newListing")}
        </button>
      </div>

      {savedMessage && (
        <p className="rounded-control bg-green-50 px-3.5 py-2.5 text-sm font-medium text-green-700">
          {t("dashboard.listingSavedConfirmation")}
        </p>
      )}

      {formOpen && (
        <NewListingForm
          publisherId={publisherId}
          onSaved={() => {
            setFormOpen(false);
            setSavedMessage(true);
            onChanged();
            setTimeout(() => setSavedMessage(false), 3000);
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colListing")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colPrice")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colStatus")}</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {listings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  {t("dashboard.noListingsYet")}
                </td>
              </tr>
            )}
            {listings.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <Link href={`/listing/${l.slug}`} className="font-medium text-neutral-800 hover:text-brand-600">
                    {l.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{priceFmt(l.price)}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", LISTING_STATUS_STYLE[l.status])}>
                    {statusLabel(l.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(l.id)}
                    disabled={deletingId === l.id}
                    className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                  >
                    {t("dashboard.deleteListing")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTab({ projects }: { projects: ReturnType<typeof projectsByDeveloper> }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.projectsTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("dashboard.projectsSubtitle")}</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700">
          <Upload className="h-4 w-4" /> {t("dashboard.bulkCsvImport")}
        </button>
      </div>
      <div className="space-y-3">
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function ProjectRow({ project: p }: { project: ReturnType<typeof projectsByDeveloper>[number] }) {
  const { t } = useT();
  const live = useProjectConstruction(p);
  const timelineRequests = useAppStore((s) => s.timelineRequests);
  const hasPending = timelineRequests.some((r) => r.projectId === p.id && r.status === "pending");
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-neutral-900">{p.name}</p>
        <div className="flex shrink-0 items-center gap-3">
          {hasPending && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {t("dashboard.timelinePendingBadge")}
            </span>
          )}
          <button
            onClick={() => setEditorOpen((v) => !v)}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("dashboard.editTimeline")}
          </button>
          <Link
            href={`/project/${p.slug}`}
            target="_blank"
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("dashboard.view3d")}
          </Link>
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {t("dashboard.unitsAvailableTotal", {
          available: p.availableUnits,
          total: p.totalUnits,
          percent: live.progressPercent,
        })}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-listing-new-dev"
          style={{ width: `${live.progressPercent}%` }}
        />
      </div>

      {editorOpen && (
        <div className="mt-4">
          <ConstructionTimelineEditor project={p} />
        </div>
      )}
    </div>
  );
}

// Deterministic mock performance numbers — a real backend would replace
// this with actual view/lead counters. Premium-only: analytics are a
// premium perk, so standard listings never call this.
function metricHash(id: string, salt: number): number {
  const s = `${id}-${salt}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function analyticsFor(id: string) {
  return {
    views: 180 + (metricHash(id, 1) % 2400),
    leads: 4 + (metricHash(id, 2) % 46),
    saves: 2 + (metricHash(id, 3) % 58),
  };
}

function AnalyticsStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-card bg-neutral-50 p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-brand-500" />
      <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function AnalyticsProjectCard({ project }: { project: ReturnType<typeof projectsByDeveloper>[number] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const metrics = analyticsFor(project.id);
  const availableUnits = project.units.filter((u) => u.status === "available");

  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-neutral-900">{project.name}</p>
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            <Crown className="h-3 w-3" /> {t("results.premium")}
          </span>
        </div>
        {availableUnits.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            {open
              ? t("dashboard.analyticsHideUnits")
              : t("dashboard.analyticsShowUnits", { count: availableUnits.length })}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <AnalyticsStat icon={Eye} label={t("dashboard.analyticsViews")} value={metrics.views} />
        <AnalyticsStat icon={MousePointerClick} label={t("dashboard.analyticsLeads")} value={metrics.leads} />
        <AnalyticsStat icon={Heart} label={t("dashboard.analyticsSaves")} value={metrics.saves} />
      </div>

      {open && (
        <div className="mt-4 overflow-hidden rounded-card border border-neutral-100">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t("dashboard.analyticsUnit")}</th>
                <th className="px-3 py-2 font-medium">{t("dashboard.analyticsViews")}</th>
                <th className="px-3 py-2 font-medium">{t("dashboard.analyticsLeads")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {availableUnits.map((u) => {
                const m = analyticsFor(`${project.id}-${u.id}`);
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2 text-neutral-700">{u.code}</td>
                    <td className="px-3 py-2 tabular-nums text-neutral-600">{m.views}</td>
                    <td className="px-3 py-2 tabular-nums text-neutral-600">{m.leads}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab({
  listings,
  projects,
}: {
  listings: Listing[];
  projects: ReturnType<typeof projectsByDeveloper>;
}) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const premiumListings = listings.filter((l) => l.premium);
  const premiumProjects = projects.filter((p) => p.premium);
  const hasPremium = premiumListings.length > 0 || premiumProjects.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.analyticsTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("dashboard.analyticsSubtitle")}</p>
      </div>

      {!hasPremium ? (
        <div className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center">
          <Crown className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-3 text-sm font-semibold text-neutral-700">{t("dashboard.analyticsEmptyTitle")}</p>
          <p className="mt-1 text-xs text-neutral-400">{t("dashboard.analyticsEmptyBody")}</p>
        </div>
      ) : (
        <>
          {premiumProjects.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-neutral-900">{t("dashboard.tabProjects")}</h2>
              {premiumProjects.map((p) => (
                <AnalyticsProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}

          {premiumListings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-neutral-900">{t("dashboard.listingsTitle")}</h2>
              <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">{t("dashboard.colListing")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("dashboard.colPrice")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("dashboard.analyticsViews")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("dashboard.analyticsLeads")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("dashboard.analyticsSaves")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {premiumListings.map((l) => {
                      const m = analyticsFor(l.id);
                      return (
                        <tr key={l.id}>
                          <td className="px-4 py-3 font-medium text-neutral-800">{l.title}</td>
                          <td className="px-4 py-3 tabular-nums text-neutral-600">{priceFmt(l.price)}</td>
                          <td className="px-4 py-3 tabular-nums text-neutral-600">{m.views}</td>
                          <td className="px-4 py-3 tabular-nums text-neutral-600">{m.leads}</td>
                          <td className="px-4 py-3 tabular-nums text-neutral-600">{m.saves}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessagesTab({ publisher }: { publisher: Publisher }) {
  const { t } = useT();
  const conversations = useAppStore((s) => s.conversations);
  const myConversations = conversations.filter((c) => c.publisherId === publisher.id);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.tabMessages")}</h1>
      <MessagesPanel conversations={myConversations} viewerId={publisher.id} />
    </div>
  );
}

function MediaTab() {
  const { t } = useT();
  return (
    <div className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center">
      <Camera className="mx-auto h-8 w-8 text-neutral-300" />
      <p className="mt-3 text-sm font-semibold text-neutral-700">{t("dashboard.mediaDropTitle")}</p>
      <p className="mt-1 text-xs text-neutral-400">{t("dashboard.mediaAccepted")}</p>
      <button className="mt-4 rounded-control bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
        {t("dashboard.chooseFiles")}
      </button>
    </div>
  );
}

function BillingTab() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.billingTitle")}</h1>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-900">{t("dashboard.subscriptionPlan")}</p>
        <p className="mt-1 text-xs text-neutral-500">{t("dashboard.renewsOn")}</p>
        <div className="mt-4 flex gap-2">
          <button className="rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white">
            {t("dashboard.managePlan")}
          </button>
          <button className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700">
            {t("dashboard.viewInvoices")}
          </button>
        </div>
      </div>
      <div className="rounded-panel border border-neutral-200 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-900">{t("dashboard.activePromotions")}</p>
        <p className="mt-2 text-xs text-neutral-500">{t("dashboard.promotionExpires")}</p>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { t } = useT();
  const orgType = useAppStore((s) => s.auth.orgType);
  const items = useMemo(() => publisherNotifications(orgType), [orgType]);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.notificationsTitle")}</h1>
      <NotificationsList items={items} />
    </div>
  );
}

const PUBLISHER_TYPE_LABEL_KEY: Record<Publisher["type"], string> = {
  private_owner: "publisher.typePrivateOwner",
  agency: "publisher.typeAgency",
  developer: "publisher.typeDeveloper",
};

function ProfileTab({ publisher }: { publisher: Publisher }) {
  const { t } = useT();
  return (
    <div id="profile" className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.profileTitle")}</h1>
      <div className="grid grid-cols-1 gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <Field label={t("dashboard.displayName")} defaultValue={publisher.name} />
        <Field label={t("dashboard.phone")} defaultValue={publisher.phone} />
        <Field label={t("dashboard.whatsapp")} defaultValue={publisher.whatsapp} />
        <Field
          label={t("dashboard.publisherType")}
          defaultValue={t(PUBLISHER_TYPE_LABEL_KEY[publisher.type])}
          disabled
        />
      </div>
      <button className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white">
        {t("dashboard.saveChanges")}
      </button>
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
