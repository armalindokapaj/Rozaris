"use client";

import { useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { CheckCircle2, ExternalLink, ShieldCheck, UploadCloud } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import { useLocations } from "@/hooks/useLocations";
import { CITY_CENTER, DEMO_PUBLISHER, stageTemplate } from "@/lib/mockData";
import type { Project } from "@/lib/types";

/** Best-effort read of a JSON `{ error }` body; every route in this app
 * that can fail now returns one (see the "rozaris-mvp-admin-project-pipe"
 * memory — `POST /api/projects` used to crash as raw HTML on a slug
 * collision, which `res.text()` alone would show verbatim and unreadably). */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    if (body?.error) return JSON.stringify(body.error);
  } catch {
    // Non-JSON body (framework error page, etc.) — fall through.
  }
  return fallback;
}

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `project-${Date.now()}`
  );
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface PublisherOption {
  id: string;
  name: string;
}

/**
 * Temporary MVP admin flow: "Create Project → Upload 3D → Configure →
 * Preview" — a deliberately stripped-down pipe whose only purpose is to
 * test the 3D Experience Configurator end-to-end, per the user's explicit
 * request (see "rozaris-mvp-admin-project-pipe" memory). Separate route
 * from `NewProjectModal.tsx` / the admin `viewer3d` tab — doesn't touch
 * either, so nothing else that already depends on that flow regresses.
 * Deliberately NOT built here (per the user's scope): inventory import,
 * map placement, search integration, construction progress, media
 * management, SEO, publishing workflow, developer management.
 *
 * Authorization is handled by the nearest `layout.tsx` (real Auth.js
 * session, server-side, via `requireAdminPage()`) before this component
 * ever renders — see that file's doc comment for why the client-side
 * Zustand `auth.signedIn` gate that used to live here was removed
 * (Multi-Channel Publishing PRD, Phase 1).
 */
export default function NewAdminProjectPage() {
  const router = useRouter();
  const addProject = useAppStore((s) => s.addProject);
  const { t } = useT();

  // The real Auth.js session (checked by every write route this page calls)
  // can go stale independently of the layout's initial gate above — this
  // route is reachable directly by URL, same as /admin/3d-experience/[id],
  // so it needs the same repair path. This exact gap was the confirmed root
  // cause of an earlier "upload always fails" bug — see
  // "rozaris-3d-editor-render-hardening" memory.
  const { sessionStatus, authError, reauthing, establishAdminSession } = useAdminSessionRepair();

  const [step, setStep] = useState<1 | 2>(1);

  // --- Step 1: Create Project ---
  const [name, setName] = useState("");
  // Real Canonical Location System (see MEMORY note
  // "rozaris-controlled-taxonomy-spec") — `POST /api/projects` now derives
  // `city` server-side from a real `neighborhoodId` and rejects anything
  // that doesn't resolve, same as NewProjectModal/EditProjectModal already
  // send. This page used to send a hardcoded `neighborhoodId: "custom"`
  // with a freeform `city` string the server silently ignored, so every
  // project created here 400'd with `Unknown location "custom"` — a real
  // bug found live (reported as "can't put a city name to create a
  // project"). Fixed by picking a real neighborhood instead of typing a
  // city, exactly like the other two creation surfaces.
  const neighborhoods = useLocations("neighborhood");
  const [neighborhoodIdChoice, setNeighborhoodIdChoice] = useState("");
  // Derived, not effect-synced (avoids a setState-in-effect render
  // cascade): defaults to the first loaded neighborhood until the admin
  // actually picks one — `useLocations` starts empty, so this naturally
  // resolves once the real `/api/locations` fetch lands.
  const neighborhoodId = neighborhoodIdChoice || neighborhoods[0]?.id || "";
  const setNeighborhoodId = setNeighborhoodIdChoice;
  const selectedNeighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  const [publishers, setPublishers] = useState<PublisherOption[]>([]);
  const [publisherId, setPublisherId] = useState(DEMO_PUBLISHER.id);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/publishers")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((rows: PublisherOption[]) => {
        if (!cancelled && rows.length > 0) {
          setPublishers(rows);
          setPublisherId(rows[0].id);
        }
      })
      .catch(() => {
        // Non-fatal — the form still works with the DEMO_PUBLISHER fallback
        // already selected by default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Real UX gap found live (reported as "Project Name... can be added
  // later"): Name used to hard-block Step 1 even though nothing else here
  // (the 3D upload, the Configurator) actually needs a real name yet — an
  // admin testing the upload pipe had to invent a placeholder name just to
  // get past this screen. Name is no longer required; a blank one gets a
  // real auto-generated placeholder in handleCreate below instead of an
  // empty string, which would otherwise render as a blank row everywhere
  // this project's name is shown.
  const canSubmit = !!neighborhoodId && !creating;

  async function handleCreate() {
    if (!canSubmit) return;
    setCreating(true);
    setCreateError(null);

    const resolvedName =
      name.trim() ||
      `Untitled Project ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    const developer = publishers.find((p) => p.id === publisherId) ?? DEMO_PUBLISHER;
    const newProject: Project = {
      id: `custom-${Date.now()}`,
      slug: slugify(resolvedName),
      name: resolvedName,
      developer: { ...DEMO_PUBLISHER, id: developer.id, name: developer.name },
      status: "coming_soon",
      progressPercent: 0,
      coords:
        selectedNeighborhood?.latitude != null && selectedNeighborhood?.longitude != null
          ? { lat: selectedNeighborhood.latitude, lng: selectedNeighborhood.longitude }
          : CITY_CENTER,
      neighborhoodId,
      city: selectedNeighborhood?.cityName ?? "Tirana",
      setting: "residential_complex",
      propertyType: "apartment",
      availableUnits: 0,
      totalUnits: 0,
      heroImage: "",
      gallery: [],
      description: { en: "", sq: "" },
      buildings: ["A"],
      amenities: [],
      premium: false,
      completionLabel: "",
      units: [],
      constructionStages: stageTemplate(0),
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newProject.id,
          slug: newProject.slug,
          name: newProject.name,
          publisherId: newProject.developer.id,
          status: newProject.status,
          progressPercent: newProject.progressPercent,
          lat: newProject.coords.lat,
          lng: newProject.coords.lng,
          neighborhoodId: newProject.neighborhoodId,
          city: newProject.city,
          setting: newProject.setting,
          propertyType: newProject.propertyType,
        }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, t("admin.newProjectCreateFailed")));
      }
      // The server may have deduped `slug` (two projects submitted with the
      // same name would otherwise collide on Postgres's unique constraint —
      // see the route's own doc comment) — use whatever it actually saved,
      // not the client-computed guess, so every later step (upload, the
      // Configurator's Preview button, /project/[slug]) stays consistent.
      const saved: { slug: string } = await res.json();
      const finalProject: Project = { ...newProject, slug: saved.slug };
      // Await-ed (unlike NewProjectModal.tsx's fire-and-forget POST) — step
      // 2 needs the real Postgres `Project` row to exist before its GLB
      // version API call can succeed.
      addProject(finalProject);
      setProject(finalProject);
      setStep(2);
    } catch (err) {
      console.error("New project: create failed", err);
      setCreateError(err instanceof Error ? err.message : t("admin.newProjectCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  // --- Step 2: Upload 3D ---
  const [detailFile, setDetailFile] = useState<File | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailDone, setDetailDone] = useState(false);
  const [unitsFile, setUnitsFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // The slot this project's one detail GLB lives in. Lazily created on
  // first upload — see the `ensureDetailSlotId` comment below for why this
  // can't just be a project-creation-time step.
  const [detailSlotId, setDetailSlotId] = useState<string | null>(null);
  // Real gap found live (reported as "drag and dropping doesn't work") —
  // both dropzones below have always LOOKED like a real HTML5 drop target
  // (the dashed border, the UploadCloud icon) but never had an
  // onDrop/onDragOver pair wired up, so a dropped file just did nothing —
  // the browser's own "navigate to this file" default behavior, silently
  // swallowed by the SPA router. `isDraggingX` only drives the active-state
  // outline; the actual file handoff reuses the exact same handlers the
  // <input>'s onChange already calls.
  const [isDraggingDetail, setIsDraggingDetail] = useState(false);
  const [isDraggingUnits, setIsDraggingUnits] = useState(false);

  // Real bug fixed here (found live, see "rozaris-mvp-admin-project-pipe"
  // memory): this page used to POST straight to
  // `/api/detail-models/${project.id}/versions`, a route that no longer
  // exists — the Multiple Detail-Model Slots pass moved version creation
  // under `.../slots/[slotId]/versions` and this page's own hardcoded
  // upload call was never updated to match, so every upload 404'd on a
  // plain Next.js HTML 404 page. `readErrorMessage` can't find `.error` in
  // an HTML body, so it silently fell back to the generic
  // "Upload failed — please try again." with no detail — exactly what was
  // reported. A brand-new project has zero slots (no auto-creation on
  // project create, unlike old backfilled projects — see
  // `slots/route.ts`'s own doc comment), so a slot has to be created here
  // before the first version can be uploaded into it.
  async function ensureDetailSlotId(): Promise<string> {
    if (detailSlotId) return detailSlotId;
    if (!project) throw new Error("No project yet.");
    const res = await fetch(`/api/detail-models/${project.id}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Building" }),
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, t("admin.detailModelUploadFailed")));
    }
    const slot: { id: string } = await res.json();
    setDetailSlotId(slot.id);
    return slot.id;
  }

  async function handleDetailUpload(file: File) {
    if (!project) return;
    setDetailError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setDetailError(t("admin.detailModelInvalidFile"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDetailError(t("admin.detailModelTooLarge", { max: formatBytes(MAX_FILE_BYTES) }));
      return;
    }
    setDetailFile(file);
    setDetailBusy(true);
    setUploadProgress(0);
    try {
      const slotId = await ensureDetailSlotId();
      // Same mechanics as Project3DConfigEditor.tsx's handleDetailFile —
      // direct client upload to Vercel Blob, then a real versioned-model
      // API call. Duplicated rather than shared: this page is a temporary
      // MVP surface, not meant to become a long-term dependency of the
      // full editor.
      const blob = await upload(`project-detail-models/${project.id}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
        multipart: true,
      });
      const res = await fetch(`/api/detail-models/${project.id}/slots/${slotId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glbUrl: blob.url, fileName: file.name, fileSize: file.size }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, t("admin.detailModelUploadFailed")));
      }
      setDetailDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      console.error("New project: 3D upload failed", err);
      setDetailError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? t("admin.sessionExpiredNote")
          : message
          ? `${t("admin.detailModelUploadFailed")} (${message})`
          : t("admin.detailModelUploadFailed")
      );
    } finally {
      setDetailBusy(false);
      setUploadProgress(null);
    }
  }

  // Shared by both dropzones — real HTML5 drag-and-drop, see the
  // isDraggingDetail/isDraggingUnits doc comment above for what this
  // fixes. `dragenter`/`dragover` both need `preventDefault()` or the
  // browser refuses to fire `drop` at all (its own default is "navigate to
  // this file"), which is the exact silent-no-op the bug report described.
  function dropHandlers(setDragging: (v: boolean) => void, onFile: (file: File) => void) {
    return {
      onDragOver: (e: DragEvent) => e.preventDefault(),
      onDragEnter: (e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      },
    };
  }

  // --- Publication (Draft/Publish, PRD-less real bug fix) ---
  // Tracked locally rather than read off `project` — the client-built
  // `Project` object this page constructs has no `approvalStatus` field at
  // all (it's not part of the shared `Project` type most pages read), and
  // the real value is knowable without a fetch: POST /api/projects now
  // always creates rows `pending` (see that route's own doc comment).
  const [publicationStatus, setPublicationStatus] = useState<"pending" | "active">("pending");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function handlePublish() {
    if (!project || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/publication`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: "active" }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, t("admin.newProjectPublishFailed")));
      }
      setPublicationStatus("active");
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("admin.newProjectPublishFailed"));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      {sessionStatus === "unauthenticated" && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-control border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700">
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
      <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        <ShieldCheck className="h-4 w-4" />
        {t("admin.newProjectPipeTitle")}
      </div>

      <div className="mb-6 flex items-center gap-3 text-xs font-medium text-neutral-500">
        <span className={step === 1 ? "text-brand-600" : "text-neutral-400"}>
          1. {t("admin.newProjectPipeStep1")}
        </span>
        <span className="text-neutral-300">→</span>
        <span className={step === 2 ? "text-brand-600" : "text-neutral-400"}>
          2. {t("admin.newProjectPipeStep2")}
        </span>
        <span className="text-neutral-300">→</span>
        <span className="text-neutral-400">3. {t("admin.newProjectPipeStep3")}</span>
      </div>

      {step === 1 && (
        <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectName")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.newProjectNamePlaceholder")}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-neutral-400">
              {t("admin.newProjectNameOptionalNote")}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("admin.newProjectNeighborhood")}
              </span>
              <select
                value={neighborhoodId}
                onChange={(e) => setNeighborhoodId(e.target.value)}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                {neighborhoods.length === 0 && <option value="">…</option>}
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.officialName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("admin.newProjectCity")}
              </span>
              <input
                value={selectedNeighborhood?.cityName ?? ""}
                readOnly
                title={t("admin.newProjectCityDerived")}
                className="w-full cursor-not-allowed rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectDeveloper")}
            </span>
            <select
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            >
              {(publishers.length > 0 ? publishers : [DEMO_PUBLISHER]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectStatus")}
            </span>
            <div className="w-full rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              {t("admin.newProjectStatusDraft")}
            </div>
          </div>

          {createError && <p className="text-xs text-red-600">{createError}</p>}

          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {creating ? t("admin.newProjectCreating") : t("admin.newProjectCreate")}
          </button>
        </div>
      )}

      {step === 2 && project && (
        <div className="space-y-5 rounded-panel border border-neutral-200 bg-white p-5">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectDetailGlb")}
            </span>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed px-3 py-6 text-sm transition-colors ${
                isDraggingDetail
                  ? "border-brand-500 bg-brand-50 text-brand-600"
                  : "border-neutral-300 text-neutral-500 hover:border-brand-400 hover:text-brand-600"
              }`}
              {...dropHandlers(setIsDraggingDetail, (file) => void handleDetailUpload(file))}
            >
              <span className="flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                {detailFile ? detailFile.name : t("admin.newProjectDetailGlbPrompt")}
              </span>
              <span className="text-[11px] text-neutral-400">{t("admin.newProjectDropHint")}</span>
              <input
                type="file"
                accept=".glb"
                className="hidden"
                disabled={detailBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleDetailUpload(file);
                }}
              />
            </label>
            {detailBusy && uploadProgress != null && (
              <p className="mt-1.5 text-xs text-neutral-400">
                {t("admin.newProjectUploading", { percent: Math.round(uploadProgress) })}
              </p>
            )}
            {detailDone && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("admin.newProjectUploadDone")}
              </p>
            )}
            {detailError && <p className="mt-1.5 text-xs text-red-600">{detailError}</p>}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectUnitsGlb")}
              <span className="ml-1 font-normal text-neutral-400">({t("common.optional")})</span>
            </span>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed px-3 py-6 text-sm transition-colors ${
                isDraggingUnits ? "border-brand-400 bg-brand-50 text-brand-600" : "border-neutral-200 text-neutral-400 hover:border-neutral-300"
              }`}
              {...dropHandlers(setIsDraggingUnits, (file) => setUnitsFile(file))}
            >
              <span className="flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                {unitsFile ? unitsFile.name : t("admin.newProjectUnitsGlbPrompt")}
              </span>
              <span className="text-[11px] text-neutral-400">{t("admin.newProjectDropHint")}</span>
              <input
                type="file"
                accept=".glb"
                className="hidden"
                onChange={(e) => setUnitsFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1.5 text-xs text-neutral-400">{t("admin.newProjectUnitsGlbNote")}</p>
          </div>

          <div className="rounded-control border border-neutral-200 bg-neutral-50 p-3.5">
            <span className="mb-2 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectPublicationTitle")}
            </span>
            <p className={`text-xs ${publicationStatus === "active" ? "text-emerald-600" : "text-amber-600"}`}>
              {publicationStatus === "active" ? t("admin.newProjectPublishedNote") : t("admin.newProjectDraftNote")}
            </p>
            {publishError && <p className="mt-1.5 text-xs text-red-600">{publishError}</p>}
            <div className="mt-3 flex gap-2">
              <a
                href={`/project/${project.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-neutral-200 bg-white py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                {t("admin.newProjectPreviewInViewer")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {publicationStatus !== "active" && (
                <button
                  onClick={handlePublish}
                  disabled={!detailDone || publishing}
                  title={!detailDone ? t("admin.newProjectDetailGlb") : undefined}
                  className="flex-1 rounded-control bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {publishing ? t("admin.newProjectPublishing") : t("admin.newProjectPublish")}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => router.push(`/admin/3d-experience/${project.id}`)}
            disabled={!detailDone}
            className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {t("admin.newProjectOpenConfigurator")}
          </button>
        </div>
      )}
    </div>
  );
}
