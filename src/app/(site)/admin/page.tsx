"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ListChecks,
  Users,
  Box,
  Boxes,
  BarChart3,
  Check,
  X,
  MessageSquare,
  Coins,
  HardHat,
  Plus,
  Map as MapIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { listings, projects, publishers } from "@/lib/mockData";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { Project3DConfigEditor } from "@/components/dashboard/Project3DConfigEditor";
import { MapModelEditor } from "@/components/dashboard/MapModelEditor";
import { NewProjectModal } from "@/components/dashboard/NewProjectModal";
import { ProjectUnitsEditor } from "@/components/dashboard/ProjectUnitsEditor";
import type { Project } from "@/lib/types";

const TABS = [
  { id: "queue", labelKey: "admin.tabQueue", icon: ListChecks },
  { id: "timeline", labelKey: "admin.tabTimeline", icon: HardHat },
  { id: "viewer3d", labelKey: "admin.tab3DExperience", icon: Boxes },
  { id: "publishers", labelKey: "admin.tabPublishers", icon: Users },
  { id: "content", labelKey: "admin.tabContent", icon: Box },
  { id: "reports", labelKey: "admin.tabReports", icon: BarChart3 },
  { id: "currency", labelKey: "admin.tabCurrency", icon: Coins },
] as const;

type TabId = (typeof TABS)[number]["id"];

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

export default function AdminPage() {
  const auth = useAppStore((s) => s.auth);
  const signIn = useAppStore((s) => s.signIn);
  const [tab, setTab] = useState<TabId>("queue");
  const [queue, setQueue] = useState(seedQueue);
  const pendingTimelineCount = useAppStore(
    (s) => s.timelineRequests.filter((r) => r.status === "pending").length
  );
  const { t } = useT();

  // In this frontend prototype, any signed-in demo account may preview the
  // Admin console — a real deployment gates this behind the Admin role.
  if (!auth.signedIn) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <ShieldCheck className="h-10 w-10 text-brand-500" />
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.signInRequired")}</h1>
        <button
          onClick={() => signIn("Admin", "admin")}
          className="rounded-control bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {t("admin.signInAsAdmin")}
        </button>
      </div>
    );
  }

  function decide(id: string) {
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <div className="mb-4 flex items-center gap-2 rounded-panel border border-neutral-200 bg-white p-3.5">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <p className="text-sm font-semibold text-neutral-900">{t("admin.consoleTitle")}</p>
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
              {id === "queue" && queue.length > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {queue.length}
                </span>
              )}
              {id === "timeline" && pendingTimelineCount > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingTimelineCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
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
                      <button
                        className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> {t("admin.requestChanges")}
                      </button>
                      <button
                        onClick={() => decide(item.id)}
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

        {tab === "viewer3d" && <Viewer3DTab />}

        {tab === "publishers" && <PublishersTab />}

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

        {tab === "currency" && <CurrencyTab />}
      </div>
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

/**
 * Admin's "3D Experience" page — merges what used to be two separate tabs
 * (3D Experience / 3D Map Control) into one project-card grid, since both
 * are just the two 3D authoring surfaces for the same project and Admin
 * was having to hunt through two identical project lists to reach them.
 * Each card shows both statuses and offers both as equally-weighted major
 * actions — neither is a secondary/buried option.
 */
function Viewer3DTab() {
  const { t } = useT();
  const configs = useAppStore((s) => s.project3DConfigs);
  const customProjects = useAppStore((s) => s.customProjects);
  const [editingScene, setEditingScene] = useState<Project | null>(null);
  const [editingMapModel, setEditingMapModel] = useState<Project | null>(null);
  const [editingUnits, setEditingUnits] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  // A real Postgres row per project (src/app/api/map-models), not Zustand —
  // see MapModelEditor.tsx/MapView.tsx's matching hooks. A project created
  // right here (via "New project" below) gets a matching Postgres row too
  // (NewProjectModal.tsx posts to /api/projects immediately after), so its
  // model can attach right away, same as a seeded mockData.ts project.
  const [mapModels, setMapModels] = useState<Record<string, { fileName: string; enabled: boolean }>>({});

  useEffect(() => {
    fetch("/api/map-models")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { projectId: string; fileName: string; enabled: boolean }[]) => {
        const byProjectId: Record<string, { fileName: string; enabled: boolean }> = {};
        rows.forEach((r) => {
          byProjectId[r.projectId] = r;
        });
        setMapModels(byProjectId);
      })
      .catch(() => {});
  }, []);

  const allProjects = [...projects, ...customProjects];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("admin.viewer3DTabTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("admin.viewer3DTabSubtitle")}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-control bg-brand-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" />
          {t("admin.newProjectButton")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allProjects.map((p) => {
          const isExperienceCustomized = !!configs[p.id];
          const model = mapModels[p.id];
          const mapStatus = !model?.fileName
            ? t("admin.mapModelStatusNone")
            : model.enabled
            ? t("admin.mapModelStatusLive")
            : t("admin.mapModelStatusDraft");
          // Units can only be added to Admin-created projects here — seeded
          // mock projects (lib/mockData) aren't store state, so there's
          // nowhere for an added unit to persist to for them.
          const isCustom = customProjects.some((cp) => cp.id === p.id);

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
                  <span
                    className={cn(
                      "flex items-center gap-1.5",
                      isExperienceCustomized ? "text-green-600" : "text-neutral-500"
                    )}
                  >
                    <Boxes className="h-3.5 w-3.5 shrink-0" />
                    {isExperienceCustomized
                      ? t("admin.viewer3DCustomized")
                      : t("admin.viewer3DUsingDefaults")}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5",
                      model?.enabled ? "text-green-600" : "text-neutral-500"
                    )}
                  >
                    <MapIcon className="h-3.5 w-3.5 shrink-0" />
                    {mapStatus}
                  </span>
                </div>

                <div className="mt-auto flex flex-col gap-1.5 pt-1">
                  <button
                    onClick={() => setEditingScene(p)}
                    className="flex items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    {t("admin.configure3DExperience")}
                  </button>
                  <button
                    onClick={() => setEditingMapModel(p)}
                    className="flex items-center justify-center gap-1.5 rounded-control bg-brand-500 py-2.5 text-xs font-semibold text-white hover:bg-brand-600"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    {t("admin.configure3DMapControl")}
                  </button>
                  {isCustom && (
                    <button
                      onClick={() => setEditingUnits(p)}
                      className="text-center text-[11px] font-medium text-neutral-500 hover:text-neutral-800 hover:underline"
                    >
                      {t("admin.manageUnits")}
                    </button>
                  )}
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

      {editingScene && (
        <Project3DConfigEditor project={editingScene} onClose={() => setEditingScene(null)} />
      )}

      {editingMapModel && (
        <MapModelEditor key={editingMapModel.id} project={editingMapModel} onClose={() => setEditingMapModel(null)} />
      )}
    </div>
  );
}

function PublishersTab() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("admin.publishersTitle")}</h1>
      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("admin.colPublisher")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colType")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colVerified")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {publishers.map((p) => (
              <tr key={p.id}>
                <td className="flex items-center gap-2.5 px-4 py-3">
                  <PlaceholderImage
                    seed={p.id}
                    kind="avatar"
                    className="h-8 w-8 rounded-lg"
                    iconClassName="h-3.5 w-3.5"
                  />
                  {p.name}
                </td>
                <td className="px-4 py-3 capitalize text-neutral-600">
                  {p.type.replace("_", " ")}
                </td>
                <td className="px-4 py-3">
                  {p.verified ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                      {t("admin.verified")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
                      {t("admin.unverified")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function CurrencyTab() {
  const { t } = useT();
  const rate = useAppStore((s) => s.eurToAllRate);
  const updatedAt = useAppStore((s) => s.eurToAllRateUpdatedAt);
  const setEurToAllRate = useAppStore((s) => s.setEurToAllRate);
  const [input, setInput] = useState(String(rate));
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const parsed = Math.round(Number(input));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setEurToAllRate(parsed, new Date().toISOString());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.currencyTitle")}</h1>
        <p className="mt-1 max-w-xl text-sm text-neutral-500">{t("admin.currencySubtitle")}</p>
      </div>

      <div className="max-w-sm space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <div>
          <p className="text-xs font-medium text-neutral-500">{t("admin.currentRateLabel")}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">
            {t("admin.currentRateValue", { rate })}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {updatedAt
              ? t("admin.lastUpdated", { date: new Date(updatedAt).toLocaleString() })
              : t("admin.neverUpdated")}
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">
            {t("admin.newRateLabel")}
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>

        <button
          onClick={handleSave}
          className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t("admin.saveRate")}
        </button>

        {saved && (
          <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            {t("admin.rateSaved")}
          </p>
        )}
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
