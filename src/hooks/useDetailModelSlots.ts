"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useAdminSessionRepair } from "./useAdminSessionRepair";
import type { DetailModelSlot } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

export interface UnitLinkRow {
  meshName: string;
  unitId: string;
  mappingStatus: string;
  /** Units Blocks & POI Layer PRD §7/§15 — the per-unit POI camera-facing
   * direction (Building-local degrees) plus its rare escape-hatch
   * overrides. Optional here purely because callers building a fresh,
   * not-yet-saved row (e.g. autoDetectLinks/setLink) don't set them —
   * the API/DB default (0°, enabled) applies once persisted. */
  poiYawDeg?: number;
  poiEnabled?: boolean;
  poiDistanceOverride?: number | null;
  poiHeightOverride?: number | null;
}

export interface DetailVersionRow {
  id: string;
  slotId: string;
  version: number;
  fileName: string;
  fileSize: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  positionX: number;
  positionZ: number;
  rotationXDeg: number;
  rotationZDeg: number;
  modelEnabled: boolean;
  modelVisible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  selectable: boolean;
  transformLocked: boolean;
  validationStatus: "ready" | "warning" | "blocked";
  validationIssues: string[] | null;
  publicationStatus: "draft" | "published" | "archived";
  publicAssetUrl: string;
  createdAt: string;
  unitLinks: UnitLinkRow[];
  sceneManifest: SceneManifestNodeRow[] | null;
  nodeOverrides: NodeOverrideRow[] | null;
}

// Kept as untyped-import-free local aliases (rather than importing
// SceneManifestNode/NodeOverride from lib/types) so this hook doesn't need
// to know their full shape — it just round-trips whatever the API returns.
export type SceneManifestNodeRow = {
  rzNodeId: string;
  name: string;
  meshIndex: number | null;
  parentRzNodeId: string | null;
  depth: number;
  isMesh: boolean;
  autoClassification: "unit_block" | "architecture";
};
export type NodeOverrideRow = Record<string, unknown> & { rzNodeId: string };

/** Real bug fix carried over from the pre-rebuild editor: a fetch that hits
 * any of this editor's write routes with a 401 needs to surface a real
 * sign-in prompt immediately rather than waiting for next-auth's cached
 * session status to notice on its own. No silent retry — see the deleted
 * Project3DConfigEditor.tsx's identical function for the full history of
 * why (an admin-auth-backdoor closure removed a security hole here). */
function fetchWithSessionRetry(
  input: string,
  init: RequestInit | undefined,
  onSessionExpired: () => void
): Promise<Response> {
  return fetch(input, init).then((res) => {
    if (res.status === 401) onSessionExpired();
    return res;
  });
}

/**
 * The Experience Editor's Scene-tab upload/slot section — Multiple
 * Detail-Model Slots (Building/+Add slot pills, each an independently
 * versioned GLB). Ported faithfully out of the deleted
 * Project3DConfigEditor.tsx as part of the Experience Editor v2 rebuild
 * (2026-08-15): this is the one piece of the old editor the rebuild was
 * told to keep working exactly as before, everything else around it is
 * being rebuilt per the new PRD. Deliberately excludes the old scale/
 * rotation/altitude sliders, unit-mesh-link mapping, and node overrides —
 * those get redesigned into the PRD's Model/Materials/Unit Mapping specs
 * in a later phase, not preserved as-is.
 */
export function useDetailModelSlots(projectId: string) {
  const { establishAdminSession } = useAdminSessionRepair();

  const [slots, setSlots] = useState<DetailModelSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [versionsBySlot, setVersionsBySlot] = useState<Record<string, DetailVersionRow[]>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailFlash, setDetailFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const versions = activeSlotId ? versionsBySlot[activeSlotId] ?? [] : [];
  const activeVersion = versions[0] ?? null;
  const isDraftActive = activeVersion?.publicationStatus === "draft";
  const canEditDetail = isDraftActive;
  const hasDetailModel = !!activeVersion;

  async function refreshSlotVersions(slotId: string): Promise<DetailVersionRow[]> {
    const res = await fetch(`/api/detail-models/${projectId}/slots/${slotId}/versions`);
    const rows: DetailVersionRow[] = res.ok ? await res.json() : [];
    setVersionsBySlot((prev) => ({ ...prev, [slotId]: rows }));
    return rows;
  }

  async function refreshActiveSlot(): Promise<DetailVersionRow[]> {
    if (!activeSlotId) return [];
    return refreshSlotVersions(activeSlotId);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail-models/${projectId}/slots`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (rows: DetailModelSlot[]) => {
        if (cancelled) return;
        setSlots(rows);
        const firstSlotId = rows[0]?.id ?? null;
        setActiveSlotId(firstSlotId);
        const entries = await Promise.all(
          rows.map(async (slot) => {
            const vres = await fetch(`/api/detail-models/${projectId}/slots/${slot.id}/versions`);
            const versionRows: DetailVersionRow[] = vres.ok ? await vres.json() : [];
            return [slot.id, versionRows] as const;
          })
        );
        if (cancelled) return;
        setVersionsBySlot(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleSelectSlot(slotId: string) {
    setActiveSlotId(slotId);
  }

  async function handleAddSlot(name: string, role?: DetailModelSlot["role"]) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/slots`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed, role }) },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const slot: DetailModelSlot = await res.json();
      setSlots((prev) => [...prev, slot]);
      setVersionsBySlot((prev) => ({ ...prev, [slot.id]: [] }));
      setActiveSlotId(slot.id);
    } catch (err) {
      console.error("Experience Editor: add slot failed", err);
      setDetailError("Couldn't add slot.");
    }
  }

  async function handleRenameSlot(slotId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/slots/${slotId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const updated: DetailModelSlot = await res.json();
      setSlots((prev) => prev.map((s) => (s.id === slotId ? updated : s)));
    } catch (err) {
      console.error("Experience Editor: rename slot failed", err);
      setDetailError("Couldn't rename slot.");
    }
  }

  async function handleDeleteSlot(slotId: string) {
    if (slots.length <= 1) return; // matches the server-side "keep at least one" rule
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    if (!window.confirm(`Delete "${slot.name}"? This removes every version in it.`)) return;
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/slots/${slotId}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const remaining = slots.filter((s) => s.id !== slotId);
      setSlots(remaining);
      setVersionsBySlot((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      if (activeSlotId === slotId && remaining[0]) setActiveSlotId(remaining[0].id);
    } catch (err) {
      console.error("Experience Editor: delete slot failed", err);
      setDetailError("Couldn't delete slot.");
    }
  }

  async function ensureActiveSlotId(): Promise<string> {
    if (activeSlotId) return activeSlotId;
    const res = await fetchWithSessionRetry(
      `/api/detail-models/${projectId}/slots`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Building" }) },
      establishAdminSession
    );
    if (!res.ok) throw new Error(await res.text());
    const slot: DetailModelSlot = await res.json();
    setSlots((prev) => [...prev, slot]);
    setVersionsBySlot((prev) => ({ ...prev, [slot.id]: [] }));
    setActiveSlotId(slot.id);
    return slot.id;
  }

  async function onFile(file: File) {
    setDetailError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setDetailError("Only .glb files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDetailError(`File too large (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    setDetailBusy(true);
    setUploadProgress(0);
    try {
      const slotId = await ensureActiveSlotId();
      const blob = await upload(`project-detail-models/${projectId}-${slotId}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
        multipart: true,
      });
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/slots/${slotId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ glbUrl: blob.url, fileName: file.name, fileSize: file.size }),
        },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshSlotVersions(slotId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      console.error("Experience Editor: upload failed", err);
      setDetailError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? "Your session expired — reconnect and try again."
          : message
          ? `Upload failed (${message})`
          : "Upload failed."
      );
    } finally {
      setDetailBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleDiscardDraft() {
    if (!isDraftActive || !activeVersion) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/versions/${activeVersion.id}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
    } catch {
      setDetailError("Couldn't discard draft.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleRemoveDetailModel() {
    if (!activeVersion || activeVersion.publicationStatus !== "published") return;
    if (!window.confirm("Remove this model from the public viewer?")) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/versions/${activeVersion.id}/unpublish`,
        { method: "POST" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
      setDetailFlash("Removed from the public viewer.");
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError("Couldn't remove model.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleDeleteModel() {
    if (!activeVersion) return;
    if (!window.confirm("Permanently delete this model? This can't be undone.")) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/versions/${activeVersion.id}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
      setDetailFlash("Model deleted.");
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError("Couldn't delete model.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleDeleteVersion(version: DetailVersionRow) {
    if (!window.confirm(`Permanently delete version ${version.version}?`)) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/versions/${version.id}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
      setDetailFlash("Version deleted.");
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError("Couldn't delete version.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleDetailRollback(versionId: string) {
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/versions/${versionId}/rollback`,
        { method: "POST" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
    } catch {
      setDetailError("Couldn't roll back.");
    } finally {
      setDetailBusy(false);
    }
  }

  /** Publish tab (PRD §42) — the real Publish Gate route already existed
   * (GLB validation not BLOCKED + no duplicate unit bindings) but had no
   * hook-level caller until this pass. Returns the error message on
   * failure (the route's own real validation-gate rejection, e.g.
   * "Blocked by validation..." or "N units linked to more than one
   * mesh...") so the Publish tab can show it, rather than swallowing it
   * into the generic detailError string other handlers use. */
  async function handlePublish(opts?: { force?: boolean; reason?: string }): Promise<string | null> {
    if (!activeVersion) return "No draft to publish.";
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/versions/${activeVersion.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: opts?.force ?? false, reason: opts?.reason }),
        },
        establishAdminSession
      );
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: string }).error ?? text;
        } catch {
          // not JSON — use the raw text
        }
        return message;
      }
      await refreshActiveSlot();
      setDetailFlash("Published.");
      setTimeout(() => setDetailFlash(null), 2500);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't publish.";
    } finally {
      setDetailBusy(false);
    }
  }

  return {
    slots,
    activeSlotId,
    versions,
    /** Units Blocks & POI Layer PRD — every slot's own latest version, not
     * just the active one, so a consumer can composite ALL slots into one
     * live preview (Building + Units together) the way the public viewer
     * already does, rather than showing only whichever slot's tab is
     * currently selected. */
    versionsBySlot,
    activeVersion,
    slotsLoaded,
    canEditDetail,
    hasDetailModel,
    detailBusy,
    uploadProgress,
    detailError,
    detailFlash,
    fileInputRef,
    onFile,
    handleSelectSlot,
    handleAddSlot,
    handleRenameSlot,
    handleDeleteSlot,
    handleDiscardDraft,
    handleRemoveDetailModel,
    handleDeleteModel,
    handleDeleteVersion,
    handleDetailRollback,
    handlePublish,
  };
}

export type UseDetailModelSlotsReturn = ReturnType<typeof useDetailModelSlots>;
