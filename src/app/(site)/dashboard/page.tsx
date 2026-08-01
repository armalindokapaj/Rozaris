"use client";

import { useState } from "react";
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
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { listingsByPublisher, projectsByDeveloper, DEMO_PUBLISHER } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { ConstructionTimelineEditor } from "@/components/dashboard/ConstructionTimelineEditor";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", labelKey: "dashboard.tabOverview", icon: LayoutDashboard },
  { id: "listings", labelKey: "dashboard.tabListings", icon: ListChecks },
  { id: "projects", labelKey: "dashboard.tabProjectsUnits", icon: Building2 },
  { id: "messages", labelKey: "dashboard.tabMessages", icon: MessageCircle },
  { id: "media", labelKey: "dashboard.tabMediaModels", icon: Camera },
  { id: "billing", labelKey: "dashboard.tabBillingPremium", icon: CreditCard },
  { id: "notifications", labelKey: "dashboard.tabNotifications", icon: Bell },
  { id: "profile", labelKey: "dashboard.tabProfile", icon: User },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function DashboardPage() {
  const auth = useAppStore((s) => s.auth);
  const signIn = useAppStore((s) => s.signIn);
  const [tab, setTab] = useState<TabId>("overview");
  const { t } = useT();

  const myListings = listingsByPublisher(DEMO_PUBLISHER.id);
  const myProjects = projectsByDeveloper(DEMO_PUBLISHER.id);

  if (!auth.signedIn) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.signInTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("dashboard.signInBody")}</p>
        <button
          onClick={() => signIn("John Doe", "publisher")}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {t("dashboard.signInDemo")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <div className="mb-4 flex items-center gap-3 rounded-panel border border-neutral-200 bg-white p-3.5">
          <PlaceholderImage
            seed={DEMO_PUBLISHER.id}
            kind="avatar"
            className="h-10 w-10 rounded-xl"
            iconClassName="h-4 w-4"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">
              {DEMO_PUBLISHER.name}
            </p>
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
        {tab === "overview" && <OverviewTab listingCount={myListings.length} projectCount={myProjects.length} />}
        {tab === "listings" && <ListingsTab listings={myListings} />}
        {tab === "projects" && <ProjectsTab projects={myProjects} />}
        {tab === "messages" && <MessagesTab />}
        {tab === "media" && <MediaTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "profile" && <ProfileTab />}
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
        <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.overviewTitle")}</h1>
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

function ListingsTab({ listings }: { listings: ReturnType<typeof listingsByPublisher> }) {
  const priceFmt = usePriceFormat();
  const { t } = useT();
  const [formOpen, setFormOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [title, setTitle] = useState("");
  const [descEn, setDescEn] = useState("");
  const [descSq, setDescSq] = useState("");
  const canSave = title.trim() !== "" && descEn.trim() !== "" && descSq.trim() !== "";

  function handleSave() {
    if (!canSave) return;
    setSavedMessage(true);
    setFormOpen(false);
    setTitle("");
    setDescEn("");
    setDescSq("");
    setTimeout(() => setSavedMessage(false), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.listingsTitle")}</h1>
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
        <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold text-neutral-900">{t("dashboard.newListingFormTitle")}</h2>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("dashboard.titleLabel")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("dashboard.descriptionEnLabel")}
              </span>
              <textarea
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                rows={4}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("dashboard.descriptionSqLabel")}
              </span>
              <textarea
                value={descSq}
                onChange={(e) => setDescSq(e.target.value)}
                rows={4}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="text-xs text-neutral-400">{t("dashboard.descriptionRequiredHint")}</p>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("dashboard.saveListing")}
            </button>
            <button
              onClick={() => setFormOpen(false)}
              className="rounded-control border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
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
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                    {t("dashboard.statusPublished")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs font-semibold text-brand-600 hover:underline">
                    {t("dashboard.edit")}
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
          <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.projectsUnitsTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("dashboard.projectsUnitsSubtitle")}</p>
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

function MessagesTab() {
  const { t } = useT();
  const conversations = useAppStore((s) => s.conversations);
  const myConversations = conversations.filter((c) => c.publisherId === DEMO_PUBLISHER.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.tabMessages")}</h1>
      <MessagesPanel conversations={myConversations} viewerId={DEMO_PUBLISHER.id} />
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
      <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.billingTitle")}</h1>
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
  const notifications = [t("dashboard.notif1"), t("dashboard.notif2"), t("dashboard.notif3")];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.notificationsTitle")}</h1>
      <div className="divide-y divide-neutral-100 rounded-panel border border-neutral-200 bg-white">
        {notifications.map((msg) => (
          <p key={msg} className="px-4 py-3 text-sm text-neutral-700">
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProfileTab() {
  const { t } = useT();
  return (
    <div id="profile" className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">{t("dashboard.profileTitle")}</h1>
      <div className="grid grid-cols-1 gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:grid-cols-2">
        <Field label={t("dashboard.displayName")} defaultValue={DEMO_PUBLISHER.name} />
        <Field label={t("dashboard.phone")} defaultValue={DEMO_PUBLISHER.phone} />
        <Field label={t("dashboard.whatsapp")} defaultValue={DEMO_PUBLISHER.whatsapp} />
        <Field label={t("dashboard.publisherType")} defaultValue={t("publisher.typeDeveloper")} disabled />
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
