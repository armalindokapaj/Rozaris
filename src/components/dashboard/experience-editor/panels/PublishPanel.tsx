"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { GroupCard, SectionHeading } from "../fields";
import type { UseDetailModelSlotsReturn } from "@/hooks/useDetailModelSlots";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { Locale, Project, Unit } from "@/lib/types";

function CheckRow({ ok, label, detail }: { ok: boolean | "warn"; label: string; detail?: string }) {
  const Icon = ok === true ? CheckCircle2 : AlertTriangle;
  const color = ok === true ? "text-green-500" : ok === "warn" ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-[11px] text-neutral-300">{label}</p>
        {detail && <p className="text-[10px] text-neutral-500">{detail}</p>}
      </div>
    </div>
  );
}

/**
 * Publish tab (PRD §42) — Preview/Validation/Versions/Publish. The real
 * Publish Gate route (GLB-validation-not-blocked + no-duplicate-unit-
 * bindings) already existed but had no caller until this pass added
 * useDetailModelSlots.handlePublish. Validation checks here read real
 * data (validationStatus, unit-link coverage, broken-link detection
 * against the real live Units list, Shot/Section counts) — Solar Path/
 * Viewer Time/Shader-error checks are honest "N/A — lands with
 * Environment/Rendering phases" rows, not fabricated passes.
 */
export function PublishPanel({
  project,
  detail,
  configEditor,
  modelEditor,
  units,
  locale,
}: {
  project: Project;
  detail: UseDetailModelSlotsReturn;
  configEditor: UseProjectConfigEditorReturn;
  modelEditor: UseModelEditorReturn;
  units: Unit[] | null;
  locale: Locale;
}) {
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const { activeVersion, versions, canEditDetail } = detail;

  const validUnitIds = new Set((units ?? []).map((u) => u.id));
  const brokenLinks = modelEditor.links.filter((l) => !validUnitIds.has(l.unitId));
  const hasOpeningShot = configEditor.draft.cameraPresets.length > 0;
  const sectionCount = configEditor.draft.sections.length;

  // Units Blocks & POI Layer PRD §26 — preview the same checks the
  // publish route itself enforces for a role=units slot, so an admin
  // sees the problem BEFORE clicking Publish and getting a 422, not
  // instead of the server-side gate (that stays authoritative — this is
  // read-only preview off the same live draft state).
  const activeSlot = detail.slots.find((s) => s.id === detail.activeSlotId) ?? null;
  const isUnitsSlot = activeSlot?.role === "units";
  const unitNodeNames = new Set((activeVersion?.sceneManifest ?? []).map((n) => n.name).filter((n) => /^Unit_/i.test(n)));
  const mappedMeshNames = new Set(modelEditor.links.map((l) => l.meshName));
  const unmappedBlocks = Array.from(unitNodeNames).filter((n) => !mappedMeshNames.has(n));
  const mappedUnitIds = new Set(modelEditor.links.map((l) => l.unitId));
  const missingUnits = (units ?? []).filter((u) => !mappedUnitIds.has(u.id));

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    const err = await detail.handlePublish();
    setPublishError(err);
    setPublishing(false);
  }

  if (!activeVersion) {
    return <p className="p-3 text-xs text-neutral-500">Upload a model on the Scene tab first.</p>;
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Preview</SectionHeading>
      <GroupCard>
        <a
          href={`/project/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open Public Viewer
        </a>
        <p className="mt-1 px-1 text-[10px] text-neutral-600">
          Opens the real public route — shows the currently PUBLISHED version, not this draft.
        </p>
      </GroupCard>

      <SectionHeading>Validation</SectionHeading>
      <GroupCard>
        <CheckRow
          ok={activeVersion.validationStatus === "ready" ? true : activeVersion.validationStatus === "warning" ? "warn" : false}
          label={`GLB validation: ${activeVersion.validationStatus}`}
          detail={activeVersion.validationIssues?.join(", ")}
        />
        <CheckRow
          ok={brokenLinks.length === 0}
          label={`Unit links: ${modelEditor.links.length} mapped`}
          detail={brokenLinks.length > 0 ? `${brokenLinks.length} reference a unit that no longer exists` : undefined}
        />
        <CheckRow ok={hasOpeningShot ? true : "warn"} label={hasOpeningShot ? "Opening Shot set" : "No Shots saved — a default framing will be used"} />
        <CheckRow ok="warn" label={`${sectionCount} section(s) authored`} detail={sectionCount === 0 ? "Optional — informational only" : undefined} />
        <CheckRow ok="warn" label="Solar Path / Viewer Time" detail="N/A — lands with the Environment tab (Phase 2)" />
        <CheckRow ok="warn" label="Shader errors" detail="N/A — no shader-compile tracking exists yet" />
        {isUnitsSlot && (
          <>
            <CheckRow
              ok={!!activeSlot?.transformParentSlotId}
              label={activeSlot?.transformParentSlotId ? "Building anchor set" : "No Building anchor set"}
              detail={activeSlot?.transformParentSlotId ? undefined : "Set the Building Anchor on the Units tab — required to publish a Units slot"}
            />
            <CheckRow
              ok={unmappedBlocks.length === 0}
              label={`Unit blocks: ${unmappedBlocks.length} unmapped`}
              detail={unmappedBlocks.length > 0 ? unmappedBlocks.slice(0, 5).join(", ") : undefined}
            />
            <CheckRow
              ok={missingUnits.length === 0}
              label={`Units missing a block: ${missingUnits.length}`}
              detail={missingUnits.length > 0 ? missingUnits.slice(0, 5).map((u) => u.code).join(", ") : undefined}
            />
          </>
        )}
      </GroupCard>

      <SectionHeading>Versions</SectionHeading>
      <div className="space-y-1">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px]">
            <div className="min-w-0">
              <span className="font-semibold text-neutral-300">v{v.version}</span>{" "}
              <span
                className={cn(
                  "font-medium",
                  v.publicationStatus === "published" ? "text-green-500" : v.publicationStatus === "draft" ? "text-amber-500" : "text-neutral-500"
                )}
              >
                {v.publicationStatus}
              </span>
              <p className="text-[10px] text-neutral-600">{formatRelativeDate(v.createdAt, locale)}</p>
            </div>
            {v.publicationStatus === "archived" && (
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => detail.handleDetailRollback(v.id)} title="Restore" className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => detail.handleDeleteVersion(v)} title="Delete" className="rounded p-1 text-red-500 hover:bg-red-500/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <SectionHeading>Publish</SectionHeading>
      <GroupCard>
        <p className="mb-2 text-[11px] text-neutral-400">
          {canEditDetail ? "Publishing flips this draft live and archives whatever was previously published." : "This version is already published."}
        </p>
        <button
          onClick={publish}
          disabled={!canEditDetail || publishing || activeVersion.validationStatus === "blocked"}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          <UploadCloud className="h-3.5 w-3.5" /> {publishing ? "Publishing…" : "Publish"}
        </button>
        {publishError && <p className="mt-2 text-[11px] font-medium text-red-400">{publishError}</p>}
      </GroupCard>
    </div>
  );
}
