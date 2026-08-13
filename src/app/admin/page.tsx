"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut as nextAuthSignOut } from "next-auth/react";
import {
  ShieldCheck,
  ListChecks,
  Users,
  Box,
  Boxes,
  BarChart3,
  LineChart,
  Check,
  X,
  MessageSquare,
  HardHat,
  Plus,
  Map as MapIcon,
  UserCog,
  Flag,
  ShieldAlert,
  UsersRound,
  Settings,
  LayoutDashboard,
  HeartPulse,
  Trash2,
  Gem,
  ChevronDown,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { listings, projects } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { NewProjectModal } from "@/components/dashboard/NewProjectModal";
import { ProjectUnitsEditor } from "@/components/dashboard/ProjectUnitsEditor";
import { AdminTopBar } from "@/components/dashboard/admin/AdminTopBar";
import { AdminDashboardTab } from "@/components/dashboard/admin/AdminDashboardTab";
import { Admin3DHealthTab } from "@/components/dashboard/admin/Admin3DHealthTab";
import { AdminAnalyticsTab } from "@/components/dashboard/admin/AdminAnalyticsTab";
import { UsersTab } from "@/components/dashboard/admin/UsersTab";
import { PublishersTab } from "@/components/dashboard/admin/PublishersTab";
import { VerificationTab } from "@/components/dashboard/admin/VerificationTab";
import { ModerationTab } from "@/components/dashboard/admin/ModerationTab";
import { SuperAdminTab, type SectionId } from "@/components/dashboard/admin/superadmin/SuperAdminTab";
import { RecycleBinPanel } from "@/components/dashboard/admin/superadmin/RecycleBinPanel";
import { AdminTeamTab } from "@/components/dashboard/admin/AdminTeamTab";
import { PlatformSettingsTab } from "@/components/dashboard/admin/PlatformSettingsTab";
import type { Project } from "@/lib/types";

// Grouped per PRD_ROZARIS_Admin_Dashboard §4 "Information Architecture"
// (Overview / Content / 3D Platform / People / Operations / System) —
// 3D Platform now has all three of its named items as real, separate tabs
// (Map Control / Experience / Health), not the single merged "3D
// authoring" tab from the previous pass. Existing tab ids are otherwise
// unchanged so old `?tab=` deep links still land right.
const TABS = [
  { id: "dashboard", labelKey: "admin.tabDashboard", icon: LayoutDashboard, group: "overview" },
  { id: "content", labelKey: "admin.tabContent", icon: Box, group: "content" },
  { id: "timeline", labelKey: "admin.tabTimeline", icon: HardHat, group: "content" },
  { id: "mapControl", labelKey: "admin.tabMapControl", icon: MapIcon, group: "3d" },
  { id: "experience", labelKey: "admin.tab3DExperience", icon: Boxes, group: "3d" },
  { id: "health3d", labelKey: "admin.tab3DHealth", icon: HeartPulse, group: "3d" },
  { id: "users", labelKey: "admin.tabUsers", icon: UserCog, group: "people" },
  { id: "publishers", labelKey: "admin.tabPublishers", icon: Users, group: "people" },
  { id: "verification", labelKey: "admin.tabVerification", icon: ShieldCheck, group: "people" },
  { id: "queue", labelKey: "admin.tabQueue", icon: ListChecks, group: "operations" },
  { id: "moderation", labelKey: "admin.tabModeration", icon: Flag, group: "operations" },
  { id: "reports", labelKey: "admin.tabReports", icon: BarChart3, group: "operations" },
  { id: "analytics", labelKey: "admin.tabAnalytics", icon: LineChart, group: "system" },
  // Was "Audit Log" (mock Zustand feed) — now the real Super Admin control/
  // audit system (Audit Log is its first, default section). Kept the same
  // tab id so any existing `?tab=auditLog` deep link still lands somewhere
  // sensible instead of falling back to the first tab.
  { id: "auditLog", labelKey: "admin.tabSuperAdmin", icon: ShieldAlert, group: "system" },
  // Same component as "auditLog" (SuperAdminTab), just pre-opened on its
  // Recycle Bin section — a real top-level shortcut to it, not a
  // duplicate feature. See RecycleBinPanel's own use below for the
  // standalone case.
  { id: "recycleBin", labelKey: "admin.tabRecycleBin", icon: Trash2, group: "system" },
  { id: "team", labelKey: "admin.tabTeam", icon: UsersRound, group: "system" },
  { id: "settings", labelKey: "admin.tabSettings", icon: Settings, group: "system" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const GROUP_ORDER = ["overview", "content", "3d", "people", "operations", "system"] as const;
const GROUP_LABEL_KEY: Record<(typeof GROUP_ORDER)[number], string> = {
  overview: "admin.navGroupOverview",
  content: "admin.navGroupContent",
  "3d": "admin.navGroup3DPlatform",
  people: "admin.navGroupPeople",
  operations: "admin.navGroupOperations",
  system: "admin.navGroupSystem",
};

interface QueueItem {
  id: string;
  title: string;
  type: "listing" | "project_update" | "publisher_verification";
  submittedBy: string;
}

const seedQueue: QueueItem[] = [
  { id: "q1", title: "Sunlit Corner Apartment — new submission", type: "listing", submittedBy: "Andi Hoxha" },
  { id: "q2", title: "Marina Residence — Unit B-212 price change", type: "project_update", submittedBy: "ALBA Construction" },
  { id: "q3", title: "Vega Real Estate — verification documents", type: "publisher_verification", submittedBy: "Vega Real Estate" },
  { id: "q4", title: "Don Bosko Heights — construction progress evidence", type: "project_update", submittedBy: "Skyline Developers" },
];

const QUEUE_TYPE_LABEL_KEY: Record<QueueItem["type"], string> = {
  listing: "admin.typeListing",
  project_update: "admin.typeProjectUpdate",
  publisher_verification: "admin.typePublisherVerification",
};

interface Me {
  name: string | null;
  email: string | null;
  superAdmin: boolean;
}

/**
 * Real page component — wrapped in Suspense below because it reads the
 * initial tab from `?tab=`, and `useSearchParams()` requires that per
 * Next.js. That query param exists so the full-page 3D editors
 * (`/admin/3d-experience/[id]`, `/admin/3d-map-control/[id]`) can link
 * `?tab=experience`/`?tab=mapControl` on their "Back" action and land
 * Admin on the same tab they came from, instead of always resetting to the
 * first tab — the tab switcher itself still only writes to local state,
 * not the URL, on every click.
 */
function AdminPageInner() {
  const auth = useAppStore((s) => s.auth);
  const signIn = useAppStore((s) => s.signIn);
  const signOutMock = useAppStore((s) => s.signOut);
  const logAudit = useAppStore((s) => s.logAudit);
  const router = useRouter();
  const searchParams = useSearchParams();
  // AC-01/§3.1: the Dashboard is the default Admin landing page — falls
  // back to it whenever `?tab=` is absent or unrecognized.
  const [tab, setTab] = useState<TabId>(() => {
    const fromUrl = searchParams.get("tab");
    return (TABS.some((tb) => tb.id === fromUrl) ? fromUrl : "dashboard") as TabId;
  });
  // Which Super Admin section (`?tab=auditLog` sub-nav) to open next time
  // `tab` becomes "auditLog" — the Dashboard's Recently Deleted/Audit Log
  // cards set this before switching tabs so SuperAdminTab remounts
  // straight into e.g. Recycle Bin instead of always its own default.
  const [superAdminSection, setSuperAdminSection] = useState<SectionId | undefined>(undefined);
  // A Global Search result for a Publisher/User has nowhere to deep-link
  // *to* (no per-record admin page exists) — the honest destination is
  // "that directory, pre-filtered to this name". This carries the name
  // across the tab switch; always reset (not just set) on every `goTo` so
  // a later, unrelated nav click can't leave a stale query sitting in a
  // tab it wasn't meant for.
  const [pendingQuery, setPendingQuery] = useState<string | undefined>(undefined);
  function goTo(tabId: string, section?: string, query?: string) {
    if (section) setSuperAdminSection(section as SectionId);
    setPendingQuery(query);
    if (TABS.some((tb) => tb.id === tabId)) setTab(tabId as TabId);
  }
  const [queue, setQueue] = useState(seedQueue);
  const pendingTimelineCount = useAppStore(
    (s) => s.timelineRequests.filter((r) => r.status === "pending").length
  );
  const { t } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Real Auth.js session repair, separate from the Zustand `auth` mock flag
  // above — see useAdminSessionRepair's doc comment. This was the root
  // cause behind "can't upload/delete a 3D model" reports; the two
  // full-page 3D editors use the same hook.
  const { sessionStatus, authError, reauthing, establishAdminSession } = useAdminSessionRepair();

  useEffect(() => {
    if (!auth.signedIn) return;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe);
  }, [auth.signedIn]);

  // In this frontend prototype, any signed-in demo account may preview the
  // Admin console — a real deployment gates this behind the Admin role.
  if (!auth.signedIn) {
    return (
      <div className="mx-auto flex h-full min-h-0 max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldCheck className="h-10 w-10 text-brand-500" />
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.signInRequired")}</h1>
        <button
          onClick={async () => {
            signIn("Admin", "admin");
            // Also establishes a REAL Auth.js session (src/auth.ts) in
            // parallel — the versioned 3D pipeline's write routes
            // (src/lib/adminAuth.ts's requireAdmin()) check this, not the
            // Zustand mock above. Every other dashboard/gate in the app is
            // untouched and still reads only the Zustand `auth` slice.
            await establishAdminSession();
          }}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {t("admin.signInAsAdmin")}
        </button>
      </div>
    );
  }

  function decide(id: string, action: "approved" | "rejected" = "approved") {
    const item = queue.find((i) => i.id === id);
    setQueue((q) => q.filter((i) => i.id !== id));
    if (item) logAudit(action === "approved" ? "Approved" : "Rejected", item.title);
  }

  async function signOutAdmin() {
    setProfileOpen(false);
    signOutMock();
    await nextAuthSignOut({ redirect: false });
    router.push("/");
  }

  const initials = (me?.name ?? "Admin")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    // Full-bleed SaaS app shell — a dark, fixed-height sidebar (the
    // console's own chrome — see admin/layout.tsx's doc comment for why
    // the public marketing header is gone) + a persistent utility bar +
    // an independently-scrolling content pane, with a slim footer status
    // bar spanning the full width beneath both. Mobile stays simple
    // stacked page flow with the nav collapsed to a horizontally-scrolling
    // strip.
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 flex-col min-h-0 lg:flex-row lg:overflow-hidden">
        {sessionStatus === "unauthenticated" && (
          <div className="fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-control border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 shadow-[var(--shadow-2)] lg:left-1/2 lg:right-auto lg:-translate-x-1/2">
            <span>{authError ?? t("admin.sessionExpiredNote")}</span>
            <button
              onClick={establishAdminSession}
              disabled={reauthing}
              className="shrink-0 rounded-control border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {reauthing ? t("admin.sessionReconnecting") : t("admin.sessionReconnect")}
            </button>
          </div>
        )}

        <aside className="rz-admin-sidebar flex shrink-0 flex-col lg:h-full lg:w-64 lg:overflow-y-auto">
          <div
            className="flex items-center gap-2 px-4 py-4"
            style={{ borderBottom: "1px solid var(--sidebar-border)" }}
          >
            <Gem className="h-5 w-5 shrink-0 text-brand-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-wide" style={{ color: "var(--sidebar-heading)" }}>
                {t("admin.brandName")}
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sidebar-text-muted)" }}>
                {me?.superAdmin ? t("admin.roleSuperAdmin") : t("admin.roleAdmin")}
              </p>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto scroll-thin px-2 py-2 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-3 lg:pb-4">
            {GROUP_ORDER.map((group) => (
              <div key={group} className="flex shrink-0 gap-1 lg:mb-3 lg:flex-col lg:gap-0.5">
                <p
                  className="hidden px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide lg:block"
                  style={{ color: "var(--sidebar-text-muted)" }}
                >
                  {t(GROUP_LABEL_KEY[group])}
                </p>
                {TABS.filter((tb) => tb.group === group).map(({ id, labelKey, icon: Icon }) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => goTo(id)}
                      className="flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium transition-colors"
                      style={
                        active
                          ? { background: "var(--color-brand-500)", color: "var(--sidebar-text-active)" }
                          : { color: "var(--sidebar-text)" }
                      }
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.background = "var(--sidebar-bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {t(labelKey)}
                      {id === "queue" && queue.length > 0 && (
                        <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                          {queue.length}
                        </span>
                      )}
                      {id === "timeline" && pendingTimelineCount > 0 && (
                        <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                          {pendingTimelineCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="relative shrink-0 px-2 pb-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-control px-2 py-3 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold" style={{ color: "var(--sidebar-text-active)" }}>
                  {me?.name ?? t("admin.consoleTitle")}
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--sidebar-text-muted)" }}>
                  {me?.email ?? ""}
                </p>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--sidebar-text-muted)" }} />
            </button>
            {profileOpen && (
              <div className="absolute bottom-full left-2 right-2 mb-1 overflow-hidden rounded-panel border border-neutral-200 bg-white shadow-[var(--shadow-2)]">
                <button
                  onClick={signOutAdmin}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("admin.signOut")}
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <AdminTopBar onNavigate={goTo} isSuperAdmin={Boolean(me?.superAdmin)} />

          <div className="min-h-0 flex-1 px-4 py-6 lg:overflow-y-auto lg:px-8 lg:py-8">
            {tab === "dashboard" && <AdminDashboardTab onNavigate={goTo} />}

            {tab === "queue" && (
              <div className="space-y-4">
                <div>
                  <h1 className="font-serif text-xl text-neutral-900">{t("admin.queueTitle")}</h1>
                  <p className="text-sm text-neutral-500">{t("admin.queueSubtitle")}</p>
                </div>
                {queue.length === 0 ? (
                  <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
                    {t("admin.queueClear")}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {queue.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-neutral-200 bg-white p-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
                          <p className="text-xs text-neutral-500">
                            {t(QUEUE_TYPE_LABEL_KEY[item.type])} ·{" "}
                            {t("admin.submittedBy", { name: item.submittedBy })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => decide(item.id)}
                            className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                          </button>
                          <button className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
                            <MessageSquare className="h-3.5 w-3.5" /> {t("admin.requestChanges")}
                          </button>
                          <button
                            onClick={() => decide(item.id, "rejected")}
                            className="flex items-center gap-1.5 rounded-control border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "timeline" && <TimelineTab />}

            {tab === "mapControl" && <Project3DGrid focus="map" />}

            {tab === "experience" && <Project3DGrid focus="experience" />}

            {tab === "health3d" && <Admin3DHealthTab />}

            {tab === "users" && <UsersTab initialQuery={pendingQuery} />}

            {tab === "publishers" && <PublishersTab initialQuery={pendingQuery} />}

            {tab === "verification" && <VerificationTab />}

            {tab === "moderation" && <ModerationTab />}

            {tab === "content" && <ContentTab />}

            {tab === "reports" && (
              <div className="space-y-4">
                <h1 className="font-serif text-xl text-neutral-900">{t("admin.reportsTitle")}</h1>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ReportStat label={t("admin.reportApprovalSla")} value="6.2h" />
                  <ReportStat label={t("admin.reportContentQuality")} value="100%" />
                  <ReportStat label={t("admin.reportDuplicateFlags")} value="3" />
                  <ReportStat label={t("admin.reportUptime")} value="99.98%" />
                </div>
              </div>
            )}

            {tab === "analytics" && <AdminAnalyticsTab />}

            {tab === "auditLog" && <SuperAdminTab initialSection={superAdminSection} />}

            {tab === "recycleBin" && (
              <div className="space-y-4">
                <RecycleBinPanel isSuperAdmin={Boolean(me?.superAdmin)} />
              </div>
            )}

            {tab === "team" && <AdminTeamTab />}

            {tab === "settings" && <PlatformSettingsTab />}
          </div>
        </div>
      </div>

      <AdminFooterBar />
    </div>
  );
}

/** Slim footer status bar spanning the full console width (below the
 * sidebar + content row) — PRD_ROZARIS_Admin_Dashboard's own reference
 * mockup shows one. "All systems operational" is derived from the same
 * real System Health signal the Dashboard's own System Status card and
 * the Super Admin System Health panel already read — not a static label. */
function AdminFooterBar() {
  const { t } = useT();
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/system-health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return setHealthy(null);
        const issues =
          data.brokenGlbs.blockedMapModels.length + data.brokenGlbs.blockedDetailModels.length + data.apiErrors.last24h;
        setHealthy(issues === 0);
      })
      .catch(() => setHealthy(null));
  }, []);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-white px-4 py-2.5 text-[11px] text-neutral-400 lg:px-8">
      <span>{t("admin.footerVersion")}</span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", healthy === null ? "bg-neutral-300" : healthy ? "bg-success" : "bg-danger")}
        />
        {healthy === null ? t("admin.footerStatusUnknown") : healthy ? t("admin.footerStatusOk") : t("admin.footerStatusIssues")}
      </span>
      <span>{t("admin.footerCopyright")}</span>
    </div>
  );
}

function TimelineTab() {
  const { t } = useT();
  const timelineRequests = useAppStore((s) => s.timelineRequests);
  const overrides = useAppStore((s) => s.projectConstructionOverrides);
  const approveTimelineRequest = useAppStore((s) => s.approveTimelineRequest);
  const rejectTimelineRequest = useAppStore((s) => s.rejectTimelineRequest);

  const pending = timelineRequests.filter((r) => r.status === "pending");
  const decided = timelineRequests.filter((r) => r.status !== "pending");

  function livePercentFor(projectId: string) {
    const override = overrides[projectId];
    if (override) return override.progressPercent;
    return projects.find((p) => p.id === projectId)?.progressPercent ?? 0;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.timelineQueueTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.timelineQueueSubtitle")}</p>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.timelineQueueClear")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-neutral-200 bg-white p-4"
            >
              <div>
                <p className="text-sm font-semibold text-neutral-900">{r.projectName}</p>
                <p className="text-xs text-neutral-500">
                  {t("admin.timelineRequestSummary", {
                    name: r.publisherName,
                    percent: r.draft.progressPercent,
                    livePercent: livePercentFor(r.projectId),
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => approveTimelineRequest(r.id)}
                  className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                >
                  <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                </button>
                <button
                  onClick={() => rejectTimelineRequest(r.id)}
                  className="flex items-center gap-1.5 rounded-control border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="space-y-2">
          {decided.slice(0, 8).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-control border border-neutral-100 px-4 py-2.5 text-xs"
            >
              <span className="text-neutral-600">
                {r.projectName} · {r.draft.progressPercent}%
              </span>
              <span
                className={cn(
                  "font-semibold",
                  r.status === "approved" ? "text-green-600" : "text-red-500"
                )}
              >
                {r.status === "approved" ? t("admin.timelineApproved") : t("admin.timelineRejected")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}

/**
 * Admin's 3D Platform project grid — shared by the "3D Map Control" and "3D
 * Experience" tabs (PRD_ROZARIS_Admin_Dashboard §4 wants these as two
 * separate nav items again, not the single merged tab a previous pass
 * combined them into). `focus` decides which of the two 3D authoring
 * surfaces gets the primary action button; both statuses are still shown
 * on every card so context isn't lost switching between the two tabs.
 */
interface VersionSummary {
  fileName: string;
  publicationStatus: "draft" | "published" | "archived";
  validationStatus: "ready" | "warning" | "blocked";
}

function summaryStatusLabel(t: ReturnType<typeof useT>["t"], summary?: VersionSummary) {
  if (!summary) return t("admin.mapModelStatusNone");
  if (summary.publicationStatus === "published") return t("admin.mapModelStatusLive");
  return t("admin.mapModelStatusDraft");
}

function StatusLine({
  icon: Icon,
  summary,
  t,
}: {
  icon: LucideIcon;
  summary?: VersionSummary;
  t: ReturnType<typeof useT>["t"];
}) {
  return (
    <span className={cn("flex items-center gap-1.5", summary?.publicationStatus === "published" ? "text-success" : "text-neutral-500")}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {summaryStatusLabel(t, summary)}
      {summary && summary.validationStatus !== "ready" && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            summary.validationStatus === "blocked" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
          )}
        >
          {t(`admin.validation${summary.validationStatus[0].toUpperCase()}${summary.validationStatus.slice(1)}`)}
        </span>
      )}
    </span>
  );
}

function Project3DGrid({ focus }: { focus: "map" | "experience" }) {
  const { t } = useT();
  const router = useRouter();
  const customProjects = useAppStore((s) => s.customProjects);
  const [editingUnits, setEditingUnits] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  // Real Postgres rows per project (src/app/api/map-models/[id]/versions,
  // src/app/api/detail-models/[id]/versions) — the latest version's
  // publish/validation status for each of Admin's two 3D authoring
  // surfaces, not Zustand. A project created right here (via "New project"
  // below) gets a matching Postgres row too (NewProjectModal.tsx posts to
  // /api/projects immediately after), so its model can attach right away,
  // same as a seeded mockData.ts project.
  const [mapModels, setMapModels] = useState<Record<string, VersionSummary>>({});
  const [detailModels, setDetailModels] = useState<Record<string, VersionSummary>>({});

  const allProjects = [...projects, ...customProjects];
  const projectIds = allProjects.map((p) => p.id).join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      allProjects.map((p) =>
        Promise.all([
          fetch(`/api/map-models/${p.id}/versions`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/detail-models/${p.id}/versions`).then((r) => (r.ok ? r.json() : [])),
        ]).then(([mapVersions, detailVersions]: [VersionSummary[], VersionSummary[]]) => [
          p.id,
          mapVersions[0],
          detailVersions[0],
        ] as const)
      )
    ).then((rows) => {
      if (cancelled) return;
      const map: Record<string, VersionSummary> = {};
      const detail: Record<string, VersionSummary> = {};
      rows.forEach(([id, mapLatest, detailLatest]) => {
        if (mapLatest) map[id] = mapLatest;
        if (detailLatest) detail[id] = detailLatest;
      });
      setMapModels(map);
      setDetailModels(detail);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds]);

  const title = focus === "map" ? t("admin.tabMapControl") : t("admin.tab3DExperience");
  const subtitle = focus === "map" ? t("admin.mapControlTabSubtitle") : t("admin.viewer3DTabSubtitle");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{title}</h1>
          <p className="text-sm text-neutral-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* MVP test pipe (Create → Upload → Configure → Preview), separate
              from the modal below — see "rozaris-mvp-admin-project-pipe"
              memory. Doesn't replace the modal; both routes to a new
              project coexist for now. */}
          <button
            onClick={() => router.push("/admin/projects/new")}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3.5 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            <Plus className="h-4 w-4" />
            {t("admin.newProjectPipeButton")}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-control bg-brand-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" />
            {t("admin.newProjectButton")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allProjects.map((p) => {
          const detailModel = detailModels[p.id];
          const mapModel = mapModels[p.id];

          return (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-card border border-neutral-200 bg-white"
            >
              <div className="relative aspect-[16/9] w-full shrink-0">
                <PlaceholderImage seed={p.slug} kind="hero" className="h-full w-full" />
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-serif text-base text-neutral-900">{p.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {p.developer.name} · {p.city}
                  </p>
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <StatusLine icon={Boxes} summary={detailModel} t={t} />
                  <StatusLine icon={MapIcon} summary={mapModel} t={t} />
                </div>

                <div className="mt-auto flex flex-col gap-1.5 pt-1">
                  {focus === "experience" ? (
                    <button
                      onClick={() => router.push(`/admin/3d-experience/${p.id}`)}
                      className="flex items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
                    >
                      <Boxes className="h-3.5 w-3.5" />
                      {t("admin.configure3DExperience")}
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/admin/3d-map-control/${p.id}`)}
                      className="flex items-center justify-center gap-1.5 rounded-control bg-brand-500 py-2.5 text-xs font-semibold text-white hover:bg-brand-600"
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                      {t("admin.configure3DMapControl")}
                    </button>
                  )}
                  <button
                    onClick={() => setEditingUnits(p)}
                    className="text-center text-[11px] font-medium text-neutral-500 hover:text-neutral-800 hover:underline"
                  >
                    {t("admin.manageUnits")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            setEditingUnits(p);
          }}
        />
      )}

      {editingUnits && (
        <ProjectUnitsEditor project={editingUnits} onClose={() => setEditingUnits(null)} />
      )}
    </div>
  );
}

function ContentTab() {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("admin.contentTitle")}</h1>
      <p className="text-sm text-neutral-500">
        {t("admin.contentSubtitle", { listings: listings.length, projects: projects.length })}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className="rounded-card border border-neutral-200 bg-white p-3.5">
            <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
            <p className="text-xs text-neutral-500">
              {p.developer.name} ·{" "}
              {priceFmt(Math.min(...p.units.map((u) => u.price)), { compact: true })}+
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4">
      <p className="text-xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
