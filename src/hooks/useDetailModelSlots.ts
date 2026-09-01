"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useAdminSessionRepair } from "./useAdminSessionRepair";
import type { DetailModelSlot } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024;

export interface UnitLinkRow {
  meshName: string;
  unitId: string;
  mappingStatus: string;
  poiYawDeg?: number;
  poiEnabled?: boolean;
  poiDistanceOverride?: number | null;
  poiHeightOverride?: number | null;
}

export interface CarryReport {
  carriedFromVersion: number | null;
  carriedCount: number;
  droppedMeshNames: string[];
  unmappedUnitNodeNames: string[];
}

function describeCarryReport(report: CarryReport | undefined, requested: boolean): string {
  if (!requested) return "Uploaded. Unit mappings were not carried over — map the blocks in the Units tab.";
  if (!report) return "Uploaded.";
  const { carriedCount, droppedMeshNames, unmappedUnitNodeNames, carriedFromVersion } = report;
  if (carriedCount === 0 && droppedMeshNames.length === 0) {
    return unmappedUnitNodeNames.length > 0
      ? `Uploaded — ${unmappedUnitNodeNames.length} unit block${unmappedUnitNodeNames.length === 1 ? "" : "s"} to map in the Units tab.`
      : "Uploaded.";
  }
  const parts = [
    `Kept ${carriedCount} unit mapping${carriedCount === 1 ? "" : "s"}${
      carriedFromVersion !== null ? ` from v${carriedFromVersion}` : ""
    }`,
  ];
  if (unmappedUnitNodeNames.length > 0) {
    parts.push(`${unmappedUnitNodeNames.length} new block${unmappedUnitNodeNames.length === 1 ? "" : "s"} to map`);
  }
  if (droppedMeshNames.length > 0) {
    parts.push(`${droppedMeshNames.length} no longer in this file (${droppedMeshNames.slice(0, 3).join(", ")}${droppedMeshNames.length > 3 ? "…" : ""})`);
  }
  return `${parts.join(" · ")}.`;
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
  const [keepUnitLinks, setKeepUnitLinks] = useState(true);
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

  async function handleSetTransformParent(slotId: string, parentSlotId: string | null) {
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${projectId}/slots/${slotId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transformParentSlotId: parentSlotId }),
        },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const updated: DetailModelSlot = await res.json();
      setSlots((prev) => prev.map((s) => (s.id === slotId ? updated : s)));
      setDetailFlash(parentSlotId ? "Building anchor set." : "Building anchor cleared.");
    } catch (err) {
      console.error("Experience Editor: set transform parent failed", err);
      setDetailError("Couldn't set the Building anchor.");
    }
  }

  async function handleDeleteSlot(slotId: string) {
    if (slots.length <= 1) return;
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
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Building", role: "building" }) },
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
    setDetailFlash(null);
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
          body: JSON.stringify({
            glbUrl: blob.url,
            fileName: file.name,
            fileSize: file.size,
            carryLinks: keepUnitLinks,
          }),
        },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const created: DetailVersionRow & { carryReport?: CarryReport } = await res.json();
      setDetailFlash(describeCarryReport(created.carryReport, keepUnitLinks));
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
    versionsBySlot,
    activeVersion,
    slotsLoaded,
    canEditDetail,
    hasDetailModel,
    detailBusy,
    uploadProgress,
    detailError,
    detailFlash,
    keepUnitLinks,
    setKeepUnitLinks,
    fileInputRef,
    onFile,
    handleSelectSlot,
    handleAddSlot,
    handleRenameSlot,
    handleSetTransformParent,
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
