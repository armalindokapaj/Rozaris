"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
  TrendingUp,
  Check,
  X,
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
  Megaphone,
  ChevronDown,
  LogOut,
  MoreVertical,
  Eye,
  EyeOff,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { useAdminProjects } from "@/hooks/useAdminProjects";
import { useAdminPublishers } from "@/hooks/useAdminPublishers";
import { listings } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { NewProjectModal } from "@/components/dashboard/NewProjectModal";
import { EditProjectModal } from "@/components/dashboard/admin/EditProjectModal";
import { ProjectUnitsEditor } from "@/components/dashboard/ProjectUnitsEditor";
import { AdminTopBar } from "@/components/dashboard/admin/AdminTopBar";
import { AdminDashboardTab } from "@/components/dashboard/admin/AdminDashboardTab";
import { Admin3DHealthTab } from "@/components/dashboard/admin/Admin3DHealthTab";
import { AdminAnalyticsTab } from "@/components/dashboard/admin/AdminAnalyticsTab";
import { UsersTab } from "@/components/dashboard/admin/UsersTab";
import { PublishersTab } from "@/components/dashboard/admin/PublishersTab";
import { ListingsManagementTab } from "@/components/dashboard/admin/ListingsManagementTab";
import { ApprovalCenterTab } from "@/components/dashboard/admin/ApprovalCenterTab";
import { ReportsTab } from "@/components/dashboard/admin/ReportsTab";
import { AdvertisingTab } from "@/components/dashboard/admin/AdvertisingTab";
import { MarketDataTab } from "@/components/dashboard/admin/MarketDataTab";
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
  { id: "listings", labelKey: "admin.tabListings", icon: ListChecks, group: "content" },
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
  { id: "advertising", labelKey: "admin.tabAdvertising", icon: Megaphone, group: "commercial" },
  { id: "marketData", labelKey: "admin.tabMarketData", icon: TrendingUp, group: "data" },
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

// "overview" isn't a real nav group anymore — "dashboard" (its one and
// only member) moved to the logo/wordmark click instead of its own nav
// row (see the sidebar header above), so a group header with nothing
// under it would just be dead space.
// "commercial" is real but deliberately thin — only "Advertising" lives
// here today. The fuller Plans/Subscriptions/Premium Placement/Leads/
// Billing group from the target admin IA isn't built yet; this group name
// is the honest home to grow it into later rather than a placeholder full
// of empty tabs (see the "Rozaris Platform Audit" memory).
const GROUP_ORDER = ["content", "3d", "people", "operations", "commercial", "data", "system"] as const;
const GROUP_LABEL_KEY: Record<(typeof GROUP_ORDER)[number], string> = {
  content: "admin.navGroupContent",
  "3d": "admin.navGroup3DPlatform",
  people: "admin.navGroupPeople",
  operations: "admin.navGroupOperations",
  commercial: "admin.navGroupCommercial",
  data: "admin.navGroupData",
  system: "admin.navGroupSystem",
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
  const openSignIn = useAppStore((s) => s.openSignIn);
  const signOutMock = useAppStore((s) => s.signOut);
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
  const [queueCount, setQueueCount] = useState(0);
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

  // SECURITY: this used to be `boolean | null` and the console below
  // rendered the instant Zustand's mock `auth.signedIn` flag was true —
  // front-end-only, and easily true for a signed-in buyer/publisher with
  // no admin role at all. `/api/admin/me` is itself gated by the real
  // `requireAdmin()` (src/lib/adminAuth.ts), so a successful response is
  // the actual authority here; everything below now waits for it instead
  // of trusting the mock. See useAdminSessionRepair's doc comment for the
  // matching fix to how a stale session gets reconnected.
  // "idle" doubles as "still checking" while `auth.signedIn` is true and
  // the fetch below hasn't resolved yet — no synchronous setState at the
  // top of the effect (the linter's react-hooks/set-state-in-effect
  // correctly flags that as a footgun), only ever inside the promise
  // callbacks, same pattern as the pre-existing `setMe` fetch this
  // replaces.
  const [meStatus, setMeStatus] = useState<"idle" | "ok" | "unauthorized">("idle");

  useEffect(() => {
    // No reset-to-"idle" branch here: the render gate below independently
    // re-checks `auth.signedIn` on every render, so a stale "ok" from a
    // previous sign-in can never leak the console after a sign-out — it
    // just gets recomputed the moment `auth.signedIn` flips back to true.
    if (!auth.signedIn) return;
    fetch("/api/admin/me")
      .then(async (r) => {
        if (!r.ok) {
          setMe(null);
          setMeStatus("unauthorized");
          return;
        }
        setMe(await r.json());
        setMeStatus("ok");
      })
      .catch(() => {
        setMe(null);
        setMeStatus("unauthorized");
      });
  }, [auth.signedIn]);

  // Sidebar badge count for the Approval Center — the real inbox
  // (`ApprovalCenterTab`) fetches its own full list when the tab is open;
  // this is just the count so the nav row shows how many are waiting
  // without mounting that whole tab. Tied to `meStatus === "ok"` (confirmed
  // real admin), not the Zustand mock — the route is `requireAdmin()`-
  // gated server-side anyway, but there's no reason to fire it early.
  useEffect(() => {
    if (meStatus !== "ok") return;
    fetch("/api/admin/approval-center")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown[]) => setQueueCount(rows.length))
      .catch(() => {});
  }, [meStatus, tab]);

  // Admin console — real role check, not front-end visibility. A
  // signed-in buyer/publisher (auth.signedIn true, meStatus "unauthorized")
  // gets turned away here rather than seeing the console shell at all.
  if (!auth.signedIn || meStatus === "idle") {
    return (
      <div className="mx-auto flex h-full min-h-0 max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldCheck className="h-10 w-10 text-brand-500" />
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.signInRequired")}</h1>
        {auth.signedIn ? (
          <p className="text-sm text-neutral-500">{t("admin.checkingAccess")}</p>
        ) : (
          <button
            onClick={openSignIn}
            className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t("admin.signInAsAdmin")}
          </button>
        )}
      </div>
    );
  }

  if (meStatus === "unauthorized") {
    return (
      <div className="mx-auto flex h-full min-h-0 max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-red-500" />
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.notAuthorizedTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.notAuthorizedBody")}</p>
      </div>
    );
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
          <button
            onClick={() => goTo("dashboard")}
            className="flex items-center gap-2 px-4 py-4 text-left"
            style={{ borderBottom: "1px solid var(--sidebar-border)" }}
            aria-label={t("admin.tabDashboard")}
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
          </button>

          <nav className="flex gap-1 overflow-x-auto scroll-thin px-2 py-2 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-3 lg:pb-4">
            {GROUP_ORDER.map((group) => (
              <div key={group} className="flex shrink-0 gap-1 lg:mb-3 lg:flex-col lg:gap-0.5">
                <p
                  className="hidden px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide lg:block"
                  style={{ color: "var(--sidebar-text-muted)" }}
                >
                  {t(GROUP_LABEL_KEY[group])}
                </p>
                {/* "dashboard" stays a real, routable tab (clicking the
                    logo/wordmark above goes there) — just no longer listed
                    as its own nav row. Its `group: "overview"` no longer
                    appears in GROUP_ORDER at all, so it's already excluded
                    here with no extra check needed. */}
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
                      {id === "queue" && queueCount > 0 && (
                        <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                          {queueCount}
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

            {tab === "queue" && <ApprovalCenterTab />}

            {tab === "timeline" && <TimelineTab />}

            {tab === "mapControl" && <Project3DGrid focus="map" />}

            {tab === "experience" && <Project3DGrid focus="experience" />}

            {tab === "health3d" && <Admin3DHealthTab />}

            {tab === "users" && <UsersTab initialQuery={pendingQuery} isSuperAdmin={me?.superAdmin} />}

            {tab === "publishers" && <PublishersTab initialQuery={pendingQuery} />}

            {tab === "verification" && <VerificationTab />}

            {tab === "moderation" && <ModerationTab />}

            {tab === "content" && <ContentTab />}
            {tab === "listings" && <ListingsManagementTab />}
            {tab === "advertising" && <AdvertisingTab />}
            {tab === "marketData" && <MarketDataTab />}

            {tab === "reports" && <ReportsTab />}

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
  const liveProjects = useAdminProjects();

  const pending = timelineRequests.filter((r) => r.status === "pending");
  const decided = timelineRequests.filter((r) => r.status !== "pending");

  function livePercentFor(projectId: string) {
    const override = overrides[projectId];
    if (override) return override.progressPercent;
    return liveProjects.find((p) => p.id === projectId)?.progressPercent ?? 0;
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

interface ProjectStatus {
  approvalStatus: "pending" | "active" | "archived";
  deletedAt: string | null;
}

function Project3DGrid({ focus }: { focus: "map" | "experience" }) {
  const { t } = useT();
  const router = useRouter();
  const customProjects = useAppStore((s) => s.customProjects);
  const liveProjects = useAdminProjects();
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
  // Live visibility state (Active / Hidden-archived / in the Recycle Bin) —
  // real `Project.approvalStatus`/`deletedAt`, fetched the same per-project
  // way as mapModels/detailModels above (mockData.ts + Zustand carry
  // neither field, see the new GET on publication/route.ts). `statusReload`
  // is bumped by the visibility menu after a mutation to refetch without a
  // full page reload.
  const [projectStatus, setProjectStatus] = useState<Record<string, ProjectStatus>>({});
  const [statusReload, setStatusReload] = useState(0);

  const allProjects = [...liveProjects, ...customProjects];
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

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      allProjects.map((p) =>
        fetch(`/api/admin/projects/${p.id}/publication`)
          .then((r) => (r.ok ? r.json() : null))
          .then((status: ProjectStatus | null) => [p.id, status] as const)
      )
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, ProjectStatus> = {};
      rows.forEach(([id, status]) => {
        if (status) next[id] = status;
      });
      setProjectStatus(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds, statusReload]);

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
          const status = projectStatus[p.id];

          return (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-card border border-neutral-200 bg-white"
            >
              <div className="relative aspect-[16/9] w-full shrink-0">
                <PlaceholderImage seed={p.slug} kind="hero" className="h-full w-full" />
                <ProjectVisibilityMenu
                  project={p}
                  status={status}
                  onChanged={() => setStatusReload((n) => n + 1)}
                  t={t}
                />
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-serif text-base text-neutral-900">{p.name}</p>
                    <ProjectStatusBadge status={status} t={t} />
                  </div>
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
                  {/* Same size/shape as the Configure button above (was a
                      small text-only link) — user-requested, see the
                      "rozaris-mvp-admin-project-pipe" memory's visibility-
                      controls note. */}
                  <button
                    onClick={() => setEditingUnits(p)}
                    className="flex items-center justify-center gap-1.5 rounded-control border border-neutral-300 bg-white py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    <Boxes className="h-3.5 w-3.5" />
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

/** Small colored pill next to a project's name reflecting its real
 * `approvalStatus`/`deletedAt` (Project3DGrid fetches this live — mockData
 * + Zustand carry neither). `undefined` (still loading) renders nothing
 * rather than a misleading default. */
function ProjectStatusBadge({ status, t }: { status: ProjectStatus | undefined; t: ReturnType<typeof useT>["t"] }) {
  if (!status) return null;
  if (status.deletedAt) {
    return (
      <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
        {t("admin.projectStatusDeleted")}
      </span>
    );
  }
  if (status.approvalStatus === "archived") {
    return (
      <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
        {t("admin.projectStatusHidden")}
      </span>
    );
  }
  if (status.approvalStatus === "pending") {
    return (
      <span className="shrink-0 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        {t("admin.projectStatusPending")}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
      {t("admin.projectStatusActive")}
    </span>
  );
}

/**
 * Per-card visibility/lifecycle menu — user-requested addition alongside
 * the Units & Model button restyle. Backs onto two already-real routes,
 * nothing new added to the schema:
 *  - `PATCH /api/admin/projects/[id]/publication` (`approvalStatus`
 *    active ⇄ archived — pre-existing "force unpublish/republish", just
 *    never had a UI on this page before).
 *  - `POST /api/admin/recycle-bin/soft-delete` (real Recycle Bin, already
 *    used by Super Admin — sets `deletedAt`, recoverable, not a hard
 *    delete).
 * The schema only has ONE "hidden but not deleted" state (`archived`) —
 * "Hide (client stopped paying)" and "Store / archive" both transition to
 * it; they're kept as two separate menu items (matching what was asked
 * for) but only differ in the default reason text prefilled into the
 * prompt, which is real and lands in the audit log either way. If a
 * genuinely distinct third state is wanted later, that needs a schema
 * change — flagged here rather than faked.
 */
function ProjectVisibilityMenu({
  project,
  status,
  onChanged,
  t,
}: {
  project: Project;
  status: ProjectStatus | undefined;
  onChanged: () => void;
  t: ReturnType<typeof useT>["t"];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : t("admin.projectVisibilityActionFailed");
  }

  async function setApproval(next: "active" | "archived", reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/publication`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: next, reason }),
      });
      if (!res.ok) throw new Error(await readError(res));
      onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.projectVisibilityActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  function handleHide() {
    const reason = window.prompt(t("admin.projectHideReasonPrompt"), t("admin.projectHideReasonDefault"));
    if (reason === null) return;
    if (!reason.trim()) {
      setError(t("admin.projectReasonRequired"));
      return;
    }
    void setApproval("archived", reason.trim());
  }

  function handleStore() {
    const reason = window.prompt(t("admin.projectStoreReasonPrompt"), t("admin.projectStoreReasonDefault"));
    if (reason === null) return;
    if (!reason.trim()) {
      setError(t("admin.projectReasonRequired"));
      return;
    }
    void setApproval("archived", reason.trim());
  }

  async function handleDelete() {
    if (!window.confirm(t("admin.projectDeleteConfirm", { name: project.name }))) return;
    const reason = window.prompt(t("admin.projectDeleteReasonPrompt"), "");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/recycle-bin/soft-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "project", entityId: project.id, reason: reason?.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await readError(res));
      onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.projectVisibilityActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const deleted = !!status?.deletedAt;
  const isActive = status?.approvalStatus === "active";
  const isArchived = status?.approvalStatus === "archived";

  return (
    <div ref={menuRef} className="absolute right-2 top-2 z-10">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!status}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white disabled:opacity-0"
        aria-label={t("admin.projectVisibilityMenu")}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-control border border-neutral-200 bg-white p-1 text-xs shadow-lg">
          {deleted ? (
            <p className="px-2 py-2 text-neutral-500">{t("admin.projectInRecycleBinNote")}</p>
          ) : (
            <>
              <button
                disabled={busy || isActive}
                onClick={() => void setApproval("active")}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <Eye className="h-3.5 w-3.5" />
                {t("admin.projectMakeVisible")}
              </button>
              <button
                disabled={busy || isArchived}
                onClick={handleHide}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <EyeOff className="h-3.5 w-3.5" />
                {t("admin.projectHide")}
              </button>
              <button
                disabled={busy || isArchived}
                onClick={handleStore}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <Archive className="h-3.5 w-3.5" />
                {t("admin.projectStore")}
              </button>
              <div className="my-1 border-t border-neutral-100" />
              <button
                disabled={busy}
                onClick={() => void handleDelete()}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left font-medium text-danger hover:bg-danger/5 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("admin.projectDelete")}
              </button>
            </>
          )}
          {error && <p className="border-t border-neutral-100 px-2 py-1.5 text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ContentTab() {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const [liveProjects, setLiveProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const { publishers } = useAdminPublishers("");

  function refreshProjects() {
    fetch("/api/admin/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then(setLiveProjects)
      .catch(() => {});
  }
  useEffect(refreshProjects, []);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("admin.contentTitle")}</h1>
      <p className="text-sm text-neutral-500">
        {t("admin.contentSubtitle", { listings: listings.length, projects: liveProjects.length })}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {liveProjects.map((p) => (
          <div key={p.id} className="flex items-start justify-between gap-2 rounded-card border border-neutral-200 bg-white p-3.5">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
              <p className="text-xs text-neutral-500">
                {p.developer.name} ·{" "}
                {p.units.length > 0 ? `${priceFmt(Math.min(...p.units.map((u) => u.price)), { compact: true })}+` : t("admin.noUnitsYet")}
              </p>
            </div>
            <button
              onClick={() => setEditing(p)}
              className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
            >
              {t("admin.manage")}
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditProjectModal
          project={editing}
          publishers={publishers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshProjects();
          }}
        />
      )}
    </div>
  );
}
