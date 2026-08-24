"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Building2,
  CalendarClock,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutGrid,
  ListChecks,
  MapPin,
  Rocket,
  Sheet,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAdminProjectRecord } from "@/hooks/useAdminProjectRecord";
import { useAdminPublishers } from "@/hooks/useAdminPublishers";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { ProjectListingsPanel } from "@/components/dashboard/admin/ProjectListingsPanel";
import { Badge, Btn, ErrorNote } from "@/components/dashboard/admin/project/kit";
import { draftDiff, draftFromProject, draftToPayload, type ProjectDraft } from "@/components/dashboard/admin/project/draft";
import { PROJECT_SECTION_IDS, type ProjectSectionId } from "@/components/dashboard/admin/project/sections";
import { ProjectOverviewSection } from "@/components/dashboard/admin/project/ProjectOverviewSection";
import { ProjectGeneralSection } from "@/components/dashboard/admin/project/ProjectGeneralSection";
import { ProjectLocationSection } from "@/components/dashboard/admin/project/ProjectLocationSection";
import { ProjectMediaSection } from "@/components/dashboard/admin/project/ProjectMediaSection";
import { ProjectFeaturesSection } from "@/components/dashboard/admin/project/ProjectFeaturesSection";
import { ProjectInventorySection } from "@/components/dashboard/admin/project/ProjectInventorySection";
import { ProjectTimelineSection } from "@/components/dashboard/admin/project/ProjectTimelineSection";
import { ProjectSheetSyncSection } from "@/components/dashboard/admin/project/ProjectSheetSyncSection";
import { ProjectTeamSection } from "@/components/dashboard/admin/project/ProjectTeamSection";
import { Project3DSection } from "@/components/dashboard/admin/project/Project3DSection";
import { ProjectPublishingSection } from "@/components/dashboard/admin/project/ProjectPublishingSection";
import { ProjectActivitySection } from "@/components/dashboard/admin/project/ProjectActivitySection";

/** Left-rail entries, grouped the way the record reads: what it IS, what
 * it SELLS, who it REACHES. */
const SECTIONS: { id: ProjectSectionId; labelKey: string; icon: LucideIcon; group: "record" | "inventory" | "reach" }[] = [
  { id: "overview", labelKey: "projectManager.navOverview", icon: Gauge, group: "record" },
  { id: "general", labelKey: "projectManager.navGeneral", icon: FileText, group: "record" },
  { id: "location", labelKey: "projectManager.navLocation", icon: MapPin, group: "record" },
  { id: "media", labelKey: "projectManager.navMedia", icon: ImageIcon, group: "record" },
  { id: "features", labelKey: "projectManager.navFeatures", icon: Building2, group: "record" },
  { id: "inventory", labelKey: "projectManager.navInventory", icon: LayoutGrid, group: "inventory" },
  { id: "sheetSync", labelKey: "projectManager.navSheetSync", icon: Sheet, group: "inventory" },
  { id: "listings", labelKey: "projectManager.navListings", icon: ListChecks, group: "inventory" },
  { id: "timeline", labelKey: "projectManager.navTimeline", icon: CalendarClock, group: "inventory" },
  { id: "team", labelKey: "projectManager.navTeam", icon: Users, group: "reach" },
  { id: "threeD", labelKey: "projectManager.nav3D", icon: Boxes, group: "reach" },
  { id: "publishing", labelKey: "projectManager.navPublishing", icon: Rocket, group: "reach" },
  { id: "activity", labelKey: "projectManager.navActivity", icon: Activity, group: "reach" },
];

const GROUPS: { id: "record" | "inventory" | "reach"; labelKey: string }[] = [
  { id: "record", labelKey: "projectManager.groupRecord" },
  { id: "inventory", labelKey: "projectManager.groupInventory" },
  { id: "reach", labelKey: "projectManager.groupReach" },
];

/** Which sections edit the shared project draft (and therefore need the
 * save bar). Everything else writes through its own API on its own. */
const DRAFT_SECTIONS: ProjectSectionId[] = ["general", "location", "media", "features"];

/**
 * The Project Manager — Admin's full-page, ERP-style record view for one
 * project, replacing `EditProjectModal`. That modal put every field in a
 * single scrolling popup: no room for the unit inventory (a separate
 * editor entirely), no listings/team/activity, no way to link a Google
 * Sheet, and nothing addressable — you could not send someone a link to a
 * project's record, because it wasn't a page.
 *
 * This is a real route (`/admin/projects/[projectId]?section=…`, gated
 * server-side by `/admin/projects/layout.tsx`), with a left rail, a
 * persistent header carrying the record's identity + status, and a save
 * bar that appears only when the shared draft is actually dirty.
 *
 * One draft, one Save, for the four sections that edit `Project` columns —
 * they all commit through the same `POST /api/projects` upsert, so
 * splitting them into four independent saves would mean four round trips
 * writing the same row, with a partial-failure state nobody wants to
 * reason about. The other nine sections own their own writes because they
 * touch entirely different tables (units, connectors, memberships,
 * listings, approval state).
 */
function ProjectManagerInner() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useT();
  const { record, loading, notFound, error, refresh } = useAdminProjectRecord(params.projectId);
  const { publishers } = useAdminPublishers("");

  const [section, setSection] = useState<ProjectSectionId>(() => {
    const fromUrl = searchParams.get("section");
    return (PROJECT_SECTION_IDS as readonly string[]).includes(fromUrl ?? "")
      ? (fromUrl as ProjectSectionId)
      : "overview";
  });
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Seed (and re-seed) the draft from whatever the server last confirmed —
  // a refetch only happens after a save or an out-of-band change, and in
  // both cases the server's copy is what should win. Adjusted DURING
  // render against the previous server value (React's own "adjusting
  // state when a prop changes" pattern) rather than in an effect, which
  // would render once with the stale draft before correcting it.
  const serverDraft = useMemo(() => (record ? draftFromProject(record.project) : null), [record]);
  const [seededFrom, setSeededFrom] = useState<ProjectDraft | null>(null);
  if (serverDraft && serverDraft !== seededFrom) {
    setSeededFrom(serverDraft);
    setDraft(serverDraft);
  }

  const dirtyFields = useMemo(
    () => (draft && serverDraft ? draftDiff(draft, serverDraft) : []),
    [draft, serverDraft]
  );
  const isDirty = dirtyFields.length > 0;

  // Leaving with unsaved edits is the one way this page can lose work —
  // the browser's own guard is the only one that also covers a tab close.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const goToSection = useCallback(
    (next: ProjectSectionId) => {
      setSection(next);
      // Mirror into the URL so a refresh (or a link sent to a colleague)
      // lands on the same section — `replace`, not `push`, so the rail
      // doesn't fill the back button with thirteen entries.
      router.replace(`/admin/projects/${params.projectId}?section=${next}`, { scroll: false });
    },
    [params.projectId, router]
  );

  const patchDraft = useCallback((patch: Partial<ProjectDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  async function save() {
    if (!draft || !record) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(record.project.id, draft)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string" ? body.error : body?.error ? JSON.stringify(body.error) : t("projectManager.saveFailed")
        );
      }
      refresh();
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("projectManager.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-neutral-500">{t("admin.loading")}</p>
      </div>
    );
  }

  if (notFound || !record || !draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-neutral-500">{error ?? t("admin.projectNotFound")}</p>
        <button
          onClick={() => router.push("/admin?tab=content")}
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          {t("admin.backToAdminConsole")}
        </button>
      </div>
    );
  }

  const { project, approvalStatus } = record;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 lg:px-6">
        <button
          onClick={() => router.push("/admin?tab=content")}
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("projectManager.backToProjects")}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold text-neutral-900">{draft.name || project.name}</h1>
              <Badge tone={approvalStatus === "active" ? "positive" : approvalStatus === "pending" ? "warning" : "neutral"}>
                {t(`projectManager.approval.${approvalStatus}`)}
              </Badge>
              <Badge tone="neutral">{t(`admin.constructionStatus.${project.status}`)}</Badge>
              {project.premium && <Badge tone="info">{t("admin.premiumBadge")}</Badge>}
            </div>
            <p className="truncate text-xs text-neutral-500">
              {project.developer.name} · {project.city} · {t("projectManager.headerUnits", { count: record.counts.units })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {approvalStatus === "active" && (
              <a
                href={`/project/${project.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-control border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                {t("projectManager.viewPublicPage")}
              </a>
            )}
            <Btn onClick={() => router.push(`/admin/3d-experience/${project.id}`)}>
              <Boxes className="h-3.5 w-3.5" />
              {t("admin.open3DExperienceShortcut")}
            </Btn>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <nav className="shrink-0 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 scroll-thin lg:w-56 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
          <div className="flex gap-1 lg:flex-col lg:gap-0">
            {GROUPS.map((group) => (
              <div key={group.id} className="flex shrink-0 gap-1 lg:mb-4 lg:flex-col lg:gap-0.5">
                <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 lg:block">
                  {t(group.labelKey)}
                </p>
                {SECTIONS.filter((s) => s.group === group.id).map(({ id, labelKey, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => goToSection(id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-control px-2.5 py-2 text-sm font-medium transition-colors",
                      section === id
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{t(labelKey)}</span>
                    {/* A dot on any record section holding unsaved edits —
                        the save bar says "you have changes", this says
                        WHERE they are. */}
                    {isDirty && DRAFT_SECTIONS.includes(id) && dirtyFieldsInSection(dirtyFields, id) && (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-5xl pb-24">
            {section === "overview" && <ProjectOverviewSection record={record} onNavigate={goToSection} />}
            {section === "general" && (
              <ProjectGeneralSection draft={draft} onChange={patchDraft} publishers={publishers} project={project} />
            )}
            {section === "location" && <ProjectLocationSection draft={draft} onChange={patchDraft} />}
            {section === "media" && (
              <ProjectMediaSection projectId={project.id} draft={draft} onChange={patchDraft} />
            )}
            {section === "features" && <ProjectFeaturesSection draft={draft} onChange={patchDraft} />}
            {section === "inventory" && <ProjectInventorySection project={project} />}
            {section === "sheetSync" && <ProjectSheetSyncSection project={project} />}
            {section === "listings" && <ProjectListingsPanel project={project} publishers={publishers} />}
            {section === "timeline" && <ProjectTimelineSection project={project} />}
            {section === "team" && <ProjectTeamSection projectId={project.id} onChanged={refresh} />}
            {section === "threeD" && <Project3DSection record={record} />}
            {section === "publishing" && <ProjectPublishingSection record={record} onChanged={refresh} />}
            {section === "activity" && <ProjectActivitySection projectId={project.id} />}
          </div>
        </div>
      </div>

      {(isDirty || saveError) && (
        <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] lg:px-6">
          {saveError && <ErrorNote>{saveError}</ErrorNote>}
          {isDirty && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-neutral-600">
                {t("projectManager.unsavedChanges", { count: dirtyFields.length })}
              </p>
              <div className="flex items-center gap-1.5">
                <Btn onClick={() => serverDraft && setDraft(serverDraft)} disabled={saving}>
                  {t("projectManager.discardChanges")}
                </Btn>
                {/* The upsert route requires both — an empty slug would
                    400 with a raw zod payload rather than anything an
                    admin can act on. */}
                <Btn
                  variant="primary"
                  onClick={() => void save()}
                  disabled={saving || !draft.name.trim() || !draft.slug.trim()}
                >
                  {saving ? t("common.loading") : t("projectManager.saveChanges")}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {!isDirty && savedAt !== null && <SavedToast key={savedAt} />}
    </div>
  );
}

/** Whether any dirty field belongs to a given record section — drives the
 * rail's unsaved dot. */
function dirtyFieldsInSection(dirty: (keyof ProjectDraft)[], section: ProjectSectionId): boolean {
  const map: Record<string, (keyof ProjectDraft)[]> = {
    general: ["name", "slug", "publisherId", "propertyType", "setting", "status", "progressPercent", "premium", "completionLabel", "descriptionEn", "descriptionSq"],
    location: ["neighborhoodId", "city", "lat", "lng"],
    media: ["heroImage", "gallery"],
    features: ["buildings", "amenities"],
  };
  return (map[section] ?? []).some((field) => dirty.includes(field));
}

function SavedToast() {
  const { t } = useT();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
      {t("projectManager.savedConfirmation")}
    </div>
  );
}

export default function ProjectManagerPage() {
  return (
    <Suspense fallback={null}>
      <ProjectManagerInner />
    </Suspense>
  );
}
