"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Home,
  DoorOpen,
  Clock,
  ShoppingBag,
  ClipboardList,
  Flag,
  AlertOctagon,
  AlertTriangle,
  Boxes,
  ShieldCheck,
  Users,
  UserX,
  Trash2,
  RotateCcw,
  HeartPulse,
  ArrowRight,
  Check,
  CheckCircle2,
  MinusCircle,
  FileWarning,
  Link2Off,
  MessageSquareWarning,
  Database,
  Search as SearchIcon,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatRelativeDate } from "@/lib/utils";
import { DonutChart, DonutLegend, HorizontalBarChart } from "./charts";
import { useSection, DashboardCard } from "./dashboardKit";

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "danger" }) {
  return (
    <div>
      <p
        className={cn(
          "font-serif text-lg leading-none",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warning" : "text-neutral-900"
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-neutral-400">{label}</p>
    </div>
  );
}

interface KpiValue {
  value: number;
  newThisWeek: number | null;
  source: "real" | "mixed" | "mock";
}
interface DashboardSummary {
  projectsLive: KpiValue;
  listingsLive: KpiValue;
  unitsAvailable: KpiValue;
  unitsReserved: KpiValue;
  unitsSold: KpiValue;
  pendingApprovals: KpiValue;
  reportsFlags: KpiValue;
}

const KPI_DEFS: { key: keyof DashboardSummary; labelKey: string; icon: LucideIcon; tab: string; tint: string }[] = [
  { key: "projectsLive", labelKey: "admin.dashboard.kpiProjectsLive", icon: Building2, tab: "content", tint: "bg-brand-50 text-brand-500" },
  { key: "listingsLive", labelKey: "admin.dashboard.kpiListingsLive", icon: Home, tab: "content", tint: "bg-brand-50 text-brand-500" },
  { key: "unitsAvailable", labelKey: "admin.dashboard.kpiUnitsAvailable", icon: DoorOpen, tab: "content", tint: "bg-success/10 text-success" },
  { key: "unitsReserved", labelKey: "admin.dashboard.kpiUnitsReserved", icon: Clock, tab: "content", tint: "bg-warning/10 text-warning" },
  { key: "unitsSold", labelKey: "admin.dashboard.kpiUnitsSold", icon: ShoppingBag, tab: "content", tint: "bg-[color-mix(in_srgb,var(--color-listing-standard)_14%,transparent)] text-[var(--color-listing-standard)]" },
  { key: "pendingApprovals", labelKey: "admin.dashboard.kpiPendingApprovals", icon: ClipboardList, tab: "queue", tint: "bg-brand-50 text-brand-500" },
  { key: "reportsFlags", labelKey: "admin.dashboard.kpiReportsFlags", icon: Flag, tab: "moderation", tint: "bg-danger/10 text-danger" },
];

function KpiRow({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<DashboardSummary>("/api/admin/dashboard/summary");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {KPI_DEFS.map(({ key, labelKey, icon: Icon, tab, tint }) => {
        const kpi = data?.[key];
        return (
          <button
            key={key}
            onClick={() => onNavigate(tab)}
            disabled={loading || error}
            className="flex flex-col items-start gap-2 rounded-panel border border-neutral-200 bg-white p-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-default disabled:opacity-60"
          >
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-control", tint)}>
              <Icon className="h-4 w-4" />
            </span>
            {loading ? (
              <div className="h-7 w-12 animate-pulse rounded bg-neutral-100" />
            ) : error || !kpi ? (
              <span className="text-xs text-neutral-400">{t("admin.dashboard.unavailableShort")}</span>
            ) : (
              <span className="font-serif text-2xl leading-none text-neutral-900">{kpi.value.toLocaleString()}</span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-500">
              {t(labelKey)}
              {kpi?.source === "mock" && (
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
                  {t("admin.dashboard.mockBadge")}
                </span>
              )}
            </span>
            {kpi && kpi.newThisWeek !== null && (
              <span className="text-[10px] font-medium text-success">
                {t("admin.dashboard.newThisWeek", { count: kpi.newThisWeek })}
              </span>
            )}
          </button>
        );
      })}
      {error && (
        <button
          onClick={reload}
          className="col-span-2 rounded-panel border border-dashed border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 sm:col-span-4 lg:col-span-7"
        >
          {t("admin.dashboard.retry")}
        </button>
      )}
    </div>
  );
}

interface PriorityItem {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  subtitle: string;
  deepLink: string;
  inlineApprove: { entityType: "listing" | "project"; entityId: string } | null;
}

const TYPE_STYLE: Record<string, { icon: LucideIcon; tint: string }> = {
  listing_pending: { icon: ClipboardList, tint: "bg-danger/10 text-danger" },
  project_pending: { icon: FileWarning, tint: "bg-brand-50 text-brand-500" },
  glb_blocked: { icon: AlertOctagon, tint: "bg-danger/10 text-danger" },
  missing_bindings: { icon: Link2Off, tint: "bg-warning/10 text-warning" },
  stuck_draft: { icon: Clock, tint: "bg-neutral-100 text-neutral-500" },
  publisher_unverified: { icon: MessageSquareWarning, tint: "bg-brand-50 text-brand-500" },
};
const DEFAULT_TYPE_STYLE = { icon: Flag, tint: "bg-neutral-100 text-neutral-500" };

function PriorityQueueCard({ go }: { go: (deepLink: string) => void }) {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<{ items: PriorityItem[]; total: number }>(
    "/api/admin/dashboard/priority-queue"
  );
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function approve(item: PriorityItem) {
    if (!item.inlineApprove) return;
    setApprovingId(item.id);
    const { entityType, entityId } = item.inlineApprove;
    const url =
      entityType === "listing"
        ? `/api/admin/listings/${entityId}/publication`
        : `/api/admin/projects/${entityId}/publication`;
    const body = entityType === "listing" ? { status: "active" } : { approvalStatus: "active" };
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) reload();
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <DashboardCard
      title={t("admin.dashboard.priorityQueueTitle")}
      loading={loading}
      error={error}
      onRetry={reload}
      action={
        data && data.total > 0 ? (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">{data.total}</span>
        ) : undefined
      }
    >
      {data && data.items.length === 0 ? (
        <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
          {t("admin.dashboard.priorityQueueEmpty")}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto scroll-thin pr-1">
          {data?.items.map((item) => {
            const style = TYPE_STYLE[item.type] ?? DEFAULT_TYPE_STYLE;
            return (
              <li key={item.id} className="flex items-center gap-1 rounded-control hover:bg-neutral-50">
                <button
                  onClick={() => go(item.deepLink)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-2 text-left"
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-control", style.tint)}>
                    <style.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-neutral-900">{item.title}</p>
                    <p className="truncate text-[11px] text-neutral-400">{item.subtitle}</p>
                  </span>
                </button>
                {item.inlineApprove ? (
                  <button
                    onClick={() => approve(item)}
                    disabled={approvingId === item.id}
                    className="mr-1 flex shrink-0 items-center gap-1 rounded-control bg-success px-2 py-1 text-[10px] font-semibold text-white hover:brightness-95 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    {approvingId === item.id ? t("admin.dashboard.approving") : t("admin.dashboard.approve")}
                  </button>
                ) : (
                  <button onClick={() => go(item.deepLink)} className="mr-2 shrink-0 p-1">
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-300" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityLabel: string | null;
  createdAt: string;
}

function useActivityFeed() {
  return useSection<{ items: ActivityItem[] }>("/api/admin/dashboard/activity");
}

function PlatformActivityCard({ feed }: { feed: ReturnType<typeof useActivityFeed> }) {
  const { t, locale } = useT();
  return (
    <DashboardCard title={t("admin.dashboard.activityTitle")} loading={feed.loading} error={feed.error} onRetry={feed.reload}>
      {feed.data && feed.data.items.length === 0 ? (
        <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
          {t("admin.dashboard.activityEmpty")}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto scroll-thin pr-1">
          {feed.data?.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 rounded-control px-1 py-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-500">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-xs text-neutral-800">
                  <span className="font-semibold text-neutral-900">{item.actor}</span> {item.action.toLowerCase()}
                  {item.entityLabel ? <span className="text-neutral-600"> · {item.entityLabel}</span> : null}
                </p>
                <p className="text-[10px] text-neutral-400">{formatRelativeDate(item.createdAt, locale)}</p>
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function AuditLogLatestCard({
  feed,
  onOpen,
}: {
  feed: ReturnType<typeof useActivityFeed>;
  onOpen: () => void;
}) {
  const { t, locale } = useT();
  return (
    <DashboardCard
      title={t("admin.dashboard.auditLogTitle")}
      loading={feed.loading}
      error={feed.error}
      onRetry={feed.reload}
      action={
        <button onClick={onOpen} className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">
          {t("admin.dashboard.viewAll")}
          <ArrowRight className="h-3 w-3" />
        </button>
      }
    >
      {feed.data && feed.data.items.length === 0 ? (
        <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
          {t("admin.dashboard.auditLogEmpty")}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto scroll-thin">
          {feed.data?.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-[11px]">
              <span className="min-w-0 truncate text-neutral-700">
                <span className="font-semibold text-neutral-900">{item.actor}</span> · {item.action}
              </span>
              <span className="shrink-0 text-neutral-400">{formatRelativeDate(item.createdAt, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

interface ThreeDHealth {
  mapGlbsLive: number;
  detailGlbsLive: number;
  experiencesDraft: number;
  experiencesPublished: number;
  failedUploads: number;
  performanceWarnings: number;
  stuckDrafts: number;
  missingBindings: { projectCount: number; projects: { projectId: string; projectName: string }[] };
  sectionErrors: null;
}

function ThreeDHealthCard({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<ThreeDHealth>("/api/admin/dashboard/3d-health");
  const total = data ? data.experiencesPublished + data.experiencesDraft + data.failedUploads : 0;

  return (
    <DashboardCard title={t("admin.dashboard.threeDHealthTitle")} loading={loading} error={error} onRetry={reload}>
      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <DonutChart
              size={104}
              thickness={13}
              centerValue={total.toLocaleString()}
              centerLabel={t("admin.dashboard.threeDHealthExperiences")}
              segments={[
                { label: t("admin.dashboard.threeDHealthPublished"), value: data.experiencesPublished, color: "var(--color-success)" },
                { label: t("admin.dashboard.threeDHealthDraft"), value: data.experiencesDraft, color: "#8973f8" },
                { label: t("admin.dashboard.threeDHealthFailedUploads"), value: data.failedUploads, color: "var(--color-danger)" },
              ]}
            />
            <div className="flex-1">
              <DonutLegend
                total={total}
                segments={[
                  { label: t("admin.dashboard.threeDHealthPublished"), value: data.experiencesPublished, color: "var(--color-success)" },
                  { label: t("admin.dashboard.threeDHealthDraft"), value: data.experiencesDraft, color: "#8973f8" },
                  { label: t("admin.dashboard.threeDHealthFailedUploads"), value: data.failedUploads, color: "var(--color-danger)" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3">
            <Stat label={t("admin.dashboard.threeDHealthMapLive")} value={data.mapGlbsLive} />
            <Stat label={t("admin.dashboard.threeDHealthDetailLive")} value={data.detailGlbsLive} />
            <Stat
              label={t("admin.dashboard.threeDHealthFailedUploads")}
              value={data.failedUploads}
              tone={data.failedUploads > 0 ? "danger" : undefined}
            />
            <Stat
              label={t("admin.dashboard.threeDHealthMissingBindings")}
              value={data.missingBindings.projectCount}
              tone={data.missingBindings.projectCount > 0 ? "warn" : undefined}
            />
          </div>

          {data.missingBindings.projects.length > 0 && (
            <ul className="space-y-1 border-t border-neutral-100 pt-2">
              {data.missingBindings.projects.slice(0, 3).map((p) => (
                <li key={p.projectId}>
                  <button
                    onClick={() => onOpenProject(p.projectId)}
                    className="truncate text-[11px] font-medium text-brand-600 hover:underline"
                  >
                    {p.projectName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </DashboardCard>
  );
}

interface InventoryPayload {
  units: { available: number; reserved: number; sold: number };
  priceIntelligence: {
    belowAverage: number;
    atAverage: number;
    aboveAverage: number;
    overallAvgPricePerSqm: number | null;
    sampleSize: number;
  };
}

const INVENTORY_COLORS = { available: "var(--color-success)", reserved: "#ca8a04", sold: "var(--color-brand-500)" };

function InventoryCard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<InventoryPayload>("/api/admin/dashboard/inventory");
  const total = data ? data.units.available + data.units.reserved + data.units.sold : 0;

  return (
    <DashboardCard
      title={t("admin.dashboard.inventoryTitle")}
      loading={loading}
      error={error}
      onRetry={reload}
      action={
        <button onClick={() => onNavigate("content")} className="text-[11px] font-semibold text-brand-600 hover:underline">
          {t("admin.dashboard.viewAll")}
        </button>
      }
    >
      {data && (
        <div className="flex items-center gap-4">
          <DonutChart
            size={116}
            thickness={14}
            centerValue={total.toLocaleString()}
            centerLabel={t("admin.dashboard.inventoryTotalUnits")}
            segments={[
              { label: t("admin.dashboard.inventoryAvailable"), value: data.units.available, color: INVENTORY_COLORS.available },
              { label: t("admin.dashboard.inventoryReserved"), value: data.units.reserved, color: INVENTORY_COLORS.reserved },
              { label: t("admin.dashboard.inventorySold"), value: data.units.sold, color: INVENTORY_COLORS.sold },
            ]}
          />
          <div className="flex-1">
            <DonutLegend
              total={total}
              segments={[
                { label: t("admin.dashboard.inventoryAvailable"), value: data.units.available, color: INVENTORY_COLORS.available },
                { label: t("admin.dashboard.inventoryReserved"), value: data.units.reserved, color: INVENTORY_COLORS.reserved },
                { label: t("admin.dashboard.inventorySold"), value: data.units.sold, color: INVENTORY_COLORS.sold },
              ]}
            />
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

function PriceIntelligenceCard() {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<InventoryPayload>("/api/admin/dashboard/inventory");
  const pi = data?.priceIntelligence;

  return (
    <DashboardCard title={t("admin.dashboard.priceIntelligenceTitle")} loading={loading} error={error} onRetry={reload}>
      {pi &&
        (pi.sampleSize === 0 ? (
          <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
            {t("admin.dashboard.priceNoSample")}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-control border border-neutral-100 p-2.5">
                <p className="font-serif text-lg text-neutral-900">{pi.belowAverage}</p>
                <p className="text-[10px] text-neutral-500">{t("admin.dashboard.priceBelowAvg")}</p>
              </div>
              <div className="rounded-control border border-neutral-100 p-2.5">
                <p className="font-serif text-lg text-neutral-900">{pi.atAverage}</p>
                <p className="text-[10px] text-neutral-500">{t("admin.dashboard.priceAtAvg")}</p>
              </div>
              <div className="rounded-control border border-neutral-100 p-2.5">
                <p className="font-serif text-lg text-neutral-900">{pi.aboveAverage}</p>
                <p className="text-[10px] text-neutral-500">{t("admin.dashboard.priceAboveAvg")}</p>
              </div>
              <div className="rounded-control border border-dashed border-neutral-200 p-2.5">
                <p className="text-xs font-semibold text-neutral-400">{t("admin.dashboard.unavailableShort")}</p>
                <p className="text-[10px] text-neutral-400">{t("admin.dashboard.priceChangeYoY")}</p>
              </div>
            </div>
            <div className="border-t border-neutral-100 pt-2.5 text-xs text-neutral-500">
              {t("admin.dashboard.priceAvgPerSqm")}:{" "}
              <span className="font-semibold text-neutral-800">
                €{pi.overallAvgPricePerSqm ? Math.round(pi.overallAvgPricePerSqm).toLocaleString() : "—"}
              </span>
            </div>
          </div>
        ))}
    </DashboardCard>
  );
}

interface PublisherHealth {
  total: number;
  verified: number;
  pendingVerification: number;
  suspended: number;
}

function PublisherHealthCard({ onNavigate }: { onNavigate: (tab: string, section?: string) => void }) {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<PublisherHealth>("/api/admin/dashboard/publishers");

  const rows: { label: string; value?: number; icon: LucideIcon; tint: string; onClick: () => void }[] = [
    { label: t("admin.dashboard.publisherTotal"), value: data?.total, icon: Users, tint: "text-neutral-400", onClick: () => onNavigate("publishers") },
    { label: t("admin.dashboard.publisherVerified"), value: data?.verified, icon: ShieldCheck, tint: "text-success", onClick: () => onNavigate("publishers") },
    { label: t("admin.dashboard.publisherPending"), value: data?.pendingVerification, icon: Clock, tint: "text-warning", onClick: () => onNavigate("verification") },
    { label: t("admin.dashboard.publisherSuspended"), value: data?.suspended, icon: UserX, tint: "text-danger", onClick: () => onNavigate("auditLog", "accountControls") },
  ];

  return (
    <DashboardCard title={t("admin.dashboard.publisherHealthTitle")} loading={loading} error={error} onRetry={reload}>
      <ul className="divide-y divide-neutral-100">
        {rows.map((row) => {
          const pct = data && data.total > 0 && row.label !== t("admin.dashboard.publisherTotal") ? ((row.value ?? 0) / data.total) * 100 : null;
          return (
            <li key={row.label}>
              <button onClick={row.onClick} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-brand-600">
                <span className="flex items-center gap-2 text-xs text-neutral-600">
                  <row.icon className={cn("h-3.5 w-3.5", row.tint)} />
                  {row.label}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-serif text-sm text-neutral-900">{row.value ?? "—"}</span>
                  {pct !== null && <span className="text-[10px] text-neutral-400">{pct.toFixed(1)}%</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}

function TopLocationsCard() {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<{ items: { city: string; count: number }[] }>(
    "/api/admin/dashboard/top-locations"
  );

  return (
    <DashboardCard title={t("admin.dashboard.topLocationsTitle")} loading={loading} error={error} onRetry={reload}>
      {data && data.items.length > 0 ? (
        <HorizontalBarChart data={data.items.map((l) => ({ label: l.city, value: l.count }))} />
      ) : (
        <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
          {t("admin.dashboard.priceNoSample")}
        </p>
      )}
    </DashboardCard>
  );
}

interface BinItem {
  id: string;
  label: string;
  deletedAt: string;
  deletedBy: string | null;
}
interface BinGroup {
  type: string;
  items: BinItem[];
}

function RecentlyDeletedCard({ onOpen }: { onOpen: () => void }) {
  const { t, locale } = useT();
  const { data, loading, error, reload } = useSection<BinGroup[]>("/api/admin/recycle-bin");
  const flat = (data ?? [])
    .flatMap((g) => g.items.map((i) => ({ ...i, type: g.type })))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .slice(0, 6);

  async function restore(type: string, id: string) {
    const res = await fetch("/api/admin/recycle-bin/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: type, entityId: id }),
    });
    if (res.ok) reload();
  }

  return (
    <DashboardCard
      title={t("admin.dashboard.recentlyDeletedTitle")}
      loading={loading}
      error={error}
      onRetry={reload}
      action={
        <button onClick={onOpen} className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">
          {t("admin.dashboard.viewAll")}
          <ArrowRight className="h-3 w-3" />
        </button>
      }
    >
      {flat.length === 0 ? (
        <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
          {t("admin.dashboard.recentlyDeletedEmpty")}
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto scroll-thin pr-1">
          {flat.map((item) => (
            <li key={`${item.type}:${item.id}`} className="flex items-center gap-2.5 rounded-control px-1 py-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-danger/10 text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-800">{item.label}</p>
                <p className="truncate text-[10px] text-neutral-400">
                  {item.type} · {formatRelativeDate(item.deletedAt, locale)}
                </p>
              </div>
              <button
                onClick={() => restore(item.type, item.id)}
                className="flex shrink-0 items-center gap-1 rounded-control border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                <RotateCcw className="h-3 w-3" />
                {t("admin.dashboard.restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

interface SystemHealthPayload {
  brokenGlbs: { blockedMapModels: unknown[]; blockedDetailModels: unknown[] };
  apiErrors: { last24h: number };
}

function StatusRow({ icon: Icon, label, state }: { icon: LucideIcon; label: string; state: "ok" | "issue" | "unmonitored" }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2 text-neutral-600">
        <Icon className="h-3.5 w-3.5 text-neutral-400" />
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 font-semibold",
          state === "ok" ? "text-success" : state === "issue" ? "text-danger" : "text-neutral-400"
        )}
      >
        {state === "ok" ? <CheckCircle2 className="h-3 w-3" /> : state === "issue" ? <AlertTriangle className="h-3 w-3" /> : <MinusCircle className="h-3 w-3" />}
        {state === "unmonitored" ? t("admin.dashboard.systemStatusUnmonitored") : t("admin.dashboard.systemStatusOperational")}
      </span>
    </div>
  );
}

function SystemStatusCard() {
  const { t } = useT();
  const { data, loading, error, reload } = useSection<SystemHealthPayload>("/api/admin/system-health");
  const glbIssues = data ? data.brokenGlbs.blockedMapModels.length + data.brokenGlbs.blockedDetailModels.length : 0;

  return (
    <DashboardCard title={t("admin.dashboard.systemStatusTitle")} loading={loading} error={error} onRetry={reload}>
      {data && (
        <div className="space-y-2.5">
          <StatusRow icon={SearchIcon} label={t("admin.dashboard.systemStatusApiLabel")} state={data.apiErrors.last24h > 0 ? "issue" : "ok"} />
          <StatusRow icon={Database} label={t("admin.dashboard.systemStatusDbLabel")} state="ok" />
          <StatusRow icon={AlertOctagon} label={t("admin.dashboard.systemStatusStorageLabel")} state="unmonitored" />
          <StatusRow icon={Boxes} label={t("admin.dashboard.systemStatus3DLabel")} state={glbIssues > 0 ? "issue" : "ok"} />
          <StatusRow icon={HeartPulse} label={t("admin.dashboard.systemStatusSearchLabel")} state="unmonitored" />
          <p className="border-t border-neutral-100 pt-2 text-[10px] leading-relaxed text-neutral-400">
            {t("admin.dashboard.systemStatusNote")}
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

export function AdminDashboardTab({ onNavigate }: { onNavigate: (tab: string, superAdminSection?: string) => void }) {
  const { t } = useT();
  const router = useRouter();
  const activityFeed = useActivityFeed();

  function go(deepLink: string) {
    if (deepLink.startsWith("/admin?tab=")) {
      onNavigate(new URLSearchParams(deepLink.split("?")[1]).get("tab") ?? "queue");
    } else {
      router.push(deepLink);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.dashboard.title")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.dashboard.subtitle")}</p>
      </div>

      <KpiRow onNavigate={onNavigate} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <PriorityQueueCard go={go} />
        <PlatformActivityCard feed={activityFeed} />
        <ThreeDHealthCard onOpenProject={(id) => router.push(`/admin/3d-experience/${id}`)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <InventoryCard onNavigate={onNavigate} />
        <PriceIntelligenceCard />
        <PublisherHealthCard onNavigate={onNavigate} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <RecentlyDeletedCard onOpen={() => onNavigate("auditLog", "recycleBin")} />
        <AuditLogLatestCard feed={activityFeed} onOpen={() => onNavigate("auditLog", "auditLog")} />
        <TopLocationsCard />
        <SystemStatusCard />
      </div>
    </div>
  );
}
