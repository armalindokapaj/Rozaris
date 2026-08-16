"use client";

import { useEffect, useState } from "react";
import { ScanSearch } from "lucide-react";
import { extractUnitNodeNames } from "@/lib/glbUnitNodes";
import { cn } from "@/lib/utils";
import { GroupCard, SectionHeading, ToggleRow } from "../fields";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";
import type { DetailVersionRow } from "@/hooks/useDetailModelSlots";
import type { Unit } from "@/lib/types";

/**
 * Scene tab → Unit Mapping (PRD §5). GLB Mesh → ROZARIS Unit ID. The
 * database stays authoritative for Available/Reserved/Sold — this only
 * decides which mesh box represents which real Unit row and whether the
 * viewport tints them by that status.
 */
export function UnitMappingPanel({
  activeVersion,
  modelEditor,
  units,
  canEdit,
  statusPreviewEnabled,
  onStatusPreviewChange,
}: {
  activeVersion: DetailVersionRow | null;
  modelEditor: UseModelEditorReturn;
  units: Unit[] | null;
  canEdit: boolean;
  statusPreviewEnabled: boolean;
  onStatusPreviewChange: (v: boolean) => void;
}) {
  const [autoDetect, setAutoDetect] = useState(true);
  const [manualMapping, setManualMapping] = useState(true);
  const [detectedNodes, setDetectedNodes] = useState<string[] | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Adjusting state during render (React's documented pattern, not an
  // effect) — clears the stale node list the instant the GLB actually
  // changes, rather than one render late.
  const [syncedGlbUrl, setSyncedGlbUrl] = useState(activeVersion?.publicAssetUrl ?? null);
  if ((activeVersion?.publicAssetUrl ?? null) !== syncedGlbUrl) {
    setSyncedGlbUrl(activeVersion?.publicAssetUrl ?? null);
    setDetectedNodes(null);
  }

  async function detect() {
    if (!activeVersion?.publicAssetUrl) return;
    setDetecting(true);
    try {
      const names = await extractUnitNodeNames(activeVersion.publicAssetUrl);
      setDetectedNodes(names);
      if (units) modelEditor.autoDetectLinks(names, units);
    } catch {
      setDetectedNodes(null);
    } finally {
      setDetecting(false);
    }
  }

  // Genuinely a side effect (network fetch) — kept as an effect, unlike
  // the synchronous reset above. autoDetect's own toggle-on should also
  // (re)trigger a scan even if the URL hasn't changed.
  // `detect` sets `detecting` at its own top, before any await — deferred
  // one macrotask out (setTimeout 0) so that first setState genuinely
  // happens outside the effect's own synchronous execution, matching the
  // promise-chain-only pattern every other data-fetch effect in this app
  // already uses (see useDetailModelSlots.ts) instead of fighting the
  // stricter set-state-in-effect check with a suppression comment.
  // `detect` itself is intentionally omitted from deps (recreated every
  // render, would otherwise loop) — only the two real inputs matter.
  useEffect(() => {
    if (!autoDetect) return;
    const timer = setTimeout(() => void detect(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersion?.publicAssetUrl, autoDetect]);

  const needsReview = (detectedNodes ?? []).filter((n) => !modelEditor.linkFor(n)).length;
  const matched = (detectedNodes ?? []).length - needsReview;

  if (!activeVersion) {
    return <p className="p-3 text-xs text-neutral-500">Upload a model on the Scene tab first.</p>;
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Unit Mapping</SectionHeading>
      <GroupCard>
        <ToggleRow label="Auto Detect" checked={autoDetect} onChange={setAutoDetect} />
        <ToggleRow label="Manual Mapping" checked={manualMapping} onChange={setManualMapping} />
        <ToggleRow label="Status Preview" checked={statusPreviewEnabled} onChange={onStatusPreviewChange} />
      </GroupCard>

      {!autoDetect && (
        <button
          onClick={() => void detect()}
          disabled={detecting}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          <ScanSearch className="h-3.5 w-3.5" />
          {detecting ? "Detecting…" : "Detect Nodes"}
        </button>
      )}

      {detectedNodes && (
        <p className="text-[11px] text-neutral-500">
          {detectedNodes.length} Unit_ node{detectedNodes.length === 1 ? "" : "s"} found ·{" "}
          <span className={cn(needsReview > 0 ? "text-amber-400" : "text-green-400")}>
            {matched} mapped, {needsReview} need review
          </span>
        </p>
      )}

      {detectedNodes && detectedNodes.length > 0 && (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {detectedNodes.map((meshName) => {
            const linkedUnitId = modelEditor.linkFor(meshName);
            const linkedUnit = units?.find((u) => u.id === linkedUnitId) ?? null;
            return (
              <div key={meshName} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-neutral-300">{meshName}</span>
                {manualMapping ? (
                  <select
                    value={linkedUnitId ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => modelEditor.setLink(meshName, e.target.value || null)}
                    className="max-w-[140px] rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-200 disabled:opacity-50"
                  >
                    <option value="">— unmapped —</option>
                    {(units ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={cn("shrink-0 font-semibold", linkedUnit ? "text-green-400" : "text-amber-400")}>
                    {linkedUnit ? linkedUnit.code : "needs review"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
