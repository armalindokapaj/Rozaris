"use client";

import type { RefObject } from "react";
import { DetailModelUpload } from "./panels/DetailModelUpload";
import { ModelPanel } from "./panels/ModelPanel";
import { UnitsPanel } from "./panels/UnitsPanel";
import { MaterialsPanel } from "./panels/MaterialsPanel";
import { EnvironmentPanel } from "./panels/EnvironmentPanel";
import { LightingPanel } from "./panels/LightingPanel";
import { RenderingPanel } from "./panels/RenderingPanel";
import { PresetsPanel } from "./panels/PresetsPanel";
import { CameraPanel } from "./panels/CameraPanel";
import { ShotsPanel } from "./panels/ShotsPanel";
import { SectionsPanel } from "./panels/SectionsPanel";
import { InteractionPanel } from "./panels/InteractionPanel";
import { PerformancePanel } from "./panels/PerformancePanel";
import { MapPanel, type SiteStatus } from "./panels/MapPanel";
import { PublishPanel } from "./panels/PublishPanel";
import { EDITOR_TAB_LABELS, EDITOR_TAB_PHASE, type EditorTabId } from "./tabs";
import type { UseDetailModelSlotsReturn } from "@/hooks/useDetailModelSlots";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import type { Locale, Project, Unit } from "@/lib/types";

function ComingSoonPanel({ tab }: { tab: EditorTabId }) {
  const phase = EDITOR_TAB_PHASE[tab];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-semibold text-neutral-300">{EDITOR_TAB_LABELS[tab]}</p>
      <p className="max-w-[220px] text-xs text-neutral-500">
        Not built yet — lands in Phase {phase} of the Experience Editor v2 rebuild, per the PRD.
      </p>
    </div>
  );
}

/** Right panel — contextual per PRD §4. Scene, Materials, Camera, and
 * Shots have real content now; every other tab is an honest placeholder. */
export function Inspector({
  activeTab,
  project,
  detail,
  modelEditor,
  configEditor,
  viewerRef,
  units,
  createUnit,
  statusPreviewEnabled,
  onStatusPreviewChange,
  onGroundAlign,
  locale,
  siteStatus,
}: {
  activeTab: EditorTabId;
  project: Project;
  detail: UseDetailModelSlotsReturn;
  modelEditor: UseModelEditorReturn;
  configEditor: UseProjectConfigEditorReturn;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
  units: Unit[] | null;
  createUnit: (unit: Unit) => Promise<boolean>;
  statusPreviewEnabled: boolean;
  onStatusPreviewChange: (v: boolean) => void;
  onGroundAlign: () => void;
  locale: Locale;
  siteStatus: SiteStatus;
}) {
  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-3">
      <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
        {EDITOR_TAB_LABELS[activeTab]}
      </p>
      {activeTab === "scene" ? (
        <div className="space-y-4">
          <DetailModelUpload slots={detail} locale={locale} />
          {detail.activeVersion && (
            <>
              <div className="h-px bg-neutral-800" />
              <ModelPanel modelEditor={modelEditor} canEdit={detail.canEditDetail} onGroundAlign={onGroundAlign} />
            </>
          )}
        </div>
      ) : activeTab === "units" ? (
        <UnitsPanel
          project={project}
          detail={detail}
          modelEditor={modelEditor}
          configEditor={configEditor}
          units={units}
          createUnit={createUnit}
          canEdit={detail.canEditDetail}
          statusPreviewEnabled={statusPreviewEnabled}
          onStatusPreviewChange={onStatusPreviewChange}
          viewerRef={viewerRef}
        />
      ) : activeTab === "materials" ? (
        <MaterialsPanel activeVersion={detail.activeVersion} modelEditor={modelEditor} canEdit={detail.canEditDetail} />
      ) : activeTab === "environment" ? (
        <EnvironmentPanel configEditor={configEditor} />
      ) : activeTab === "lighting" ? (
        <LightingPanel configEditor={configEditor} projectId={project.id} />
      ) : activeTab === "rendering" ? (
        <RenderingPanel configEditor={configEditor} />
      ) : activeTab === "presets" ? (
        <PresetsPanel configEditor={configEditor} locale={locale} />
      ) : activeTab === "camera" ? (
        <CameraPanel configEditor={configEditor} canEdit={true} viewerRef={viewerRef} />
      ) : activeTab === "shots" ? (
        <ShotsPanel configEditor={configEditor} canEdit={true} viewerRef={viewerRef} />
      ) : activeTab === "sections" ? (
        <SectionsPanel configEditor={configEditor} viewerRef={viewerRef} canEdit={true} />
      ) : activeTab === "interaction" ? (
        <InteractionPanel configEditor={configEditor} />
      ) : activeTab === "performance" ? (
        <PerformancePanel configEditor={configEditor} />
      ) : activeTab === "map" ? (
        <MapPanel project={project} configEditor={configEditor} siteStatus={siteStatus} />
      ) : activeTab === "publish" ? (
        <PublishPanel project={project} detail={detail} configEditor={configEditor} modelEditor={modelEditor} units={units} locale={locale} />
      ) : (
        <ComingSoonPanel tab={activeTab} />
      )}
    </aside>
  );
}
