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
  Plus,
  Map as MapIcon,
  MapPin,
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
  Share2,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { useAdminProjects } from "@/hooks/useAdminProjects";
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
import { ListingsTab } from "@/components/dashboard/admin/ListingsTab";
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
import { LocationsTab } from "@/components/dashboard/admin/LocationsTab";
import type { Project } from "@/lib/types";

const TABS = [
  { id: "dashboard", labelKey: "admin.tabDashboard", icon: LayoutDashboard, group: "overview" },
  { id: "content", labelKey: "admin.tabContent", icon: Box, group: "content" },
  { id: "listings", labelKey: "admin.tabListings", icon: ListChecks, group: "content" },
  { id: "locations", labelKey: "admin.tabLocations", icon: MapPin, group: "content" },
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
  { id: "auditLog", labelKey: "admin.tabSuperAdmin", icon: ShieldAlert, group: "system" },
  { id: "recycleBin", labelKey: "admin.tabRecycleBin", icon: Trash2, group: "system" },
  { id: "team", labelKey: "admin.tabTeam", icon: UsersRound, group: "system" },
  { id: "settings", labelKey: "admin.tabSettings", icon: Settings, group: "system" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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

function AdminPageInner() {
  const auth = useAppStore((s) => s.auth);
  const openSignIn = useAppStore((s) => s.openSignIn);
  const signOutMock = useAppStore((s) => s.signOut);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => {
    const fromUrl = searchParams.get("tab");
    return (TABS.some((tb) => tb.id === fromUrl) ? fromUrl : "dashboard") as TabId;
  });
  const [superAdminSection, setSuperAdminSection] = useState<SectionId | undefined>(undefined);
  const [pendingQuery, setPendingQuery] = useState<string | undefined>(undefined);
  function goTo(tabId: string, section?: string, query?: string) {
    if (section) setSuperAdminSection(section as SectionId);
    setPendingQuery(query);
    if (TABS.some((tb) => tb.id === tabId)) {
      setTab(tabId as TabId);
      router.replace(`/admin?tab=${tabId}`, { scroll: false });
    }
  }
  const [queueCount, setQueueCount] = useState(0);
  const pendingTimelineCount = useAppStore(
    (s) => s.timelineRequests.filter((r) => r.status === "pending").length
  );
  const { t } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { sessionStatus, authError, reauthing, establishAdminSession } = useAdminSessionRepair();

  const [meStatus, setMeStatus] = useState<"idle" | "ok" | "unauthorized">("idle");

  useEffect(() => {
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

  useEffect(() => {
    if (meStatus !== "ok") return;
    fetch("/api/admin/approval-center")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown[]) => setQueueCount(rows.length))
      .catch(() => {});
  }, [meStatus, tab]);

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
                {                                                       
                                                       }
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
                      {                                                    
                                                          }
                      {id === "content" && pendingTimelineCount > 0 && (
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

            {tab === "mapControl" && <Project3DGrid focus="map" />}

            {tab === "experience" && <Project3DGrid focus="experience" />}

            {tab === "health3d" && <Admin3DHealthTab />}

            {tab === "users" && <UsersTab initialQuery={pendingQuery} isSuperAdmin={me?.superAdmin} />}

            {tab === "publishers" && <PublishersTab initialQuery={pendingQuery} />}

            {tab === "verification" && <VerificationTab />}

            {tab === "moderation" && <ModerationTab />}

            {tab === "content" && <ContentTab />}
            {tab === "listings" && <ListingsTab />}
            {tab === "locations" && <LocationsTab />}
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

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}

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
  const removeProject = useAppStore((s) => s.removeProject);
  const { projects: liveProjects, loaded: liveProjectsLoaded } = useAdminProjects();
  const [editingUnits, setEditingUnits] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [mapModels, setMapModels] = useState<Record<string, VersionSummary>>({});
  const [detailModels, setDetailModels] = useState<Record<string, VersionSummary>>({});
  const [projectStatus, setProjectStatus] = useState<Record<string, ProjectStatus>>({});
  const [statusReload, setStatusReload] = useState(0);

  const liveProjectIds = new Set(liveProjects.map((p) => p.id));
  useEffect(() => {
    if (!liveProjectsLoaded) return;
    for (const p of customProjects) {
      if (!liveProjectIds.has(p.id)) removeProject(p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveProjectsLoaded, liveProjects.length]);
  const allProjects = [...liveProjects, ...customProjects.filter((p) => !liveProjectIds.has(p.id))];
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
          {                                                                  
                                         }
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
                  {                                                       
                                       }
                  <button
                    onClick={() => setEditingUnits(p)}
                    className="flex items-center justify-center gap-1.5 rounded-control border border-neutral-300 bg-white py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    {t("admin.manageUnits")}
                  </button>
                  {                                                         
                                                       }
                  <button
                    onClick={() => router.push(`/admin/distribution/${p.id}`)}
                    className="flex items-center justify-center gap-1.5 rounded-control border border-neutral-300 bg-white py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {t("admin.configureDistribution")}
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
  const removeProject = useAppStore((s) => s.removeProject);

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
      if (res.status === 404) {
        removeProject(project.id);
        onChanged();
        setOpen(false);
        return;
      }
      if (!res.ok) throw new Error(await readError(res));
      removeProject(project.id);
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

type AdminProjectRow = Project & { approvalStatus: "pending" | "active" | "archived"; createdAt: string };

function ContentTab() {
  const { t } = useT();
  const router = useRouter();
  const priceFmt = usePriceFormat();
  const [liveProjects, setLiveProjects] = useState<AdminProjectRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "units" | "available" | "price">("name");

  function refreshProjects() {
    fetch("/api/admin/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AdminProjectRow[]) => {
        setLiveProjects(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }
  useEffect(refreshProjects, []);

  const visible = (() => {
    const q = query.trim().toLowerCase();
    const rows = liveProjects.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.developer.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q)) &&
        (!statusFilter || p.approvalStatus === statusFilter)
    );
    const entryPrice = (p: AdminProjectRow) =>
      p.units.length > 0 ? Math.min(...p.units.map((u) => u.price)) : Number.POSITIVE_INFINITY;
    return [...rows].sort((a, b) => {
      if (sortKey === "units") return b.units.length - a.units.length;
      if (sortKey === "available")
        return b.units.filter((u) => u.status === "available").length - a.units.filter((u) => u.status === "available").length;
      if (sortKey === "price") return entryPrice(a) - entryPrice(b);
      return a.name.localeCompare(b.name);
    });
  })();

  const totalUnits = liveProjects.reduce((sum, p) => sum + p.units.length, 0);
  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400";
  const td = "px-3 py-2.5 text-sm text-neutral-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("admin.contentTitle")}</h1>
          <p className="text-sm text-neutral-500">
            {t("admin.contentSubtitle", { projects: liveProjects.length })} · {t("projectManager.indexTotalUnits", { count: totalUnits })}
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/projects/new")}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("projectManager.newProject")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("projectManager.searchProjects")}
          className="min-w-[200px] flex-1 rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        >
          <option value="">{t("projectManager.allApprovalStates")}</option>
          <option value="active">{t("projectManager.approval.active")}</option>
          <option value="pending">{t("projectManager.approval.pending")}</option>
          <option value="archived">{t("projectManager.approval.archived")}</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        >
          <option value="name">{t("projectManager.sortByName")}</option>
          <option value="units">{t("projectManager.sortByUnits")}</option>
          <option value="available">{t("projectManager.sortByAvailable")}</option>
          <option value="price">{t("projectManager.sortByEntryPrice")}</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-panel border border-neutral-200 bg-white scroll-thin">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-neutral-100 bg-neutral-50">
            <tr>
              <th className={th}>{t("projectManager.colProject")}</th>
              <th className={th}>{t("admin.newProjectDeveloper")}</th>
              <th className={`${th} text-right`}>{t("projectManager.colUnits")}</th>
              <th className={`${th} text-right`}>{t("projectManager.status.available")}</th>
              <th className={`${th} text-right`}>{t("projectManager.colEntryPrice")}</th>
              <th className={th}>{t("projectManager.colState")}</th>
              <th className={`${th} text-right`}>{t("projectManager.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((p) => {
              const available = p.units.filter((u) => u.status === "available").length;
              return (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/admin/projects/${p.id}`)}
                  className="cursor-pointer hover:bg-neutral-50"
                >
                  <td className={td}>
                    <p className="font-semibold text-neutral-900">{p.name}</p>
                    <p className="text-xs text-neutral-500">{p.city}</p>
                  </td>
                  <td className={`${td} text-neutral-600`}>{p.developer.name}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.units.length}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    <span className={available === 0 ? "text-neutral-400" : "font-semibold text-emerald-600"}>{available}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {p.units.length > 0 ? priceFmt(Math.min(...p.units.map((u) => u.price)), { compact: true }) : "—"}
                  </td>
                  <td className={td}>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        p.approvalStatus === "active" && "bg-emerald-50 text-emerald-700",
                        p.approvalStatus === "pending" && "bg-amber-50 text-amber-700",
                        p.approvalStatus === "archived" && "bg-neutral-100 text-neutral-600"
                      )}
                    >
                      {t(`projectManager.approval.${p.approvalStatus}`)}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    <span className="text-xs font-semibold text-brand-600">{t("admin.manage")} →</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loaded && visible.length === 0 && (
          <p className="px-3 py-10 text-center text-xs text-neutral-400">
            {liveProjects.length === 0 ? t("projectManager.indexEmpty") : t("projectManager.indexNoMatch")}
          </p>
        )}
        {!loaded && <p className="px-3 py-10 text-center text-xs text-neutral-400">{t("admin.loading")}</p>}
      </div>
    </div>
  );
}
