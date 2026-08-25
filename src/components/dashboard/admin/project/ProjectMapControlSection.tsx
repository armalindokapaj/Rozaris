"use client";

import { ExternalLink } from "lucide-react";
import { MapModelEditor } from "@/components/dashboard/MapModelEditor";
import { useT } from "@/lib/i18n/useT";
import type { Project } from "@/lib/types";
import { Btn, SectionHeader } from "./kit";
import type { ProjectDraft } from "./draft";

/**
 * Project Manager → "3D Map Control". The same `MapModelEditor` that owns
 * the standalone `/admin/3d-map-control/[projectId]` page, embedded in the
 * record view so the development's site — the thing the whole ERP record
 * is about — is placed in the same place its name, its inventory and its
 * publishing state are, instead of on a route reachable only from a
 * different console tab.
 *
 * The pin here is the project's ONE location (src/lib/projectLocation.ts).
 * Embedded, it edits the shared record draft rather than saving itself, so
 * the pin, the neighbourhood picked in "Location" and the coordinates
 * typed there are three views of a single value with a single Save —
 * exactly the thing that used to be three independently-authored
 * coordinates that could drift. Everything else the editor does (the GLB
 * upload, scale/heading/altitude, hidden building footprints, version
 * publish/rollback) keeps its own draft/publish lifecycle and its own
 * buttons: those are model content, versioned, and deliberately not part
 * of the record's save bar.
 */
export function ProjectMapControlSection({
  project,
  draft,
  onChange,
  savedAt,
}: {
  project: Project;
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
  /** The record's last successful save — forwarded as the editor's
   * `reloadToken` so its version list re-reads the coordinates the save
   * just re-anchored. */
  savedAt: number | null;
}) {
  const { t } = useT();

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("projectManager.mapControlTitle")}
        description={t("projectManager.mapControlSectionDescription")}
        actions={
          <Btn
            type="button"
            onClick={() => window.open(`/admin/3d-map-control/${project.id}`, "_blank", "noopener")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("projectManager.mapControlOpenFullPage")}
          </Btn>
        }
      />

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <MapModelEditor
          project={project}
          embedded
          location={{ lat: draft.lat, lng: draft.lng }}
          onLocationChange={(point) => onChange({ lat: point.lat, lng: point.lng })}
          locationNote={t("admin.mapModelLocationInRecord")}
          reloadToken={savedAt}
          // No `onSaveLocation` / `onDeleteProject` / `onClose` — the
          // record view's own save bar and header own all three.
        />
      </div>
    </div>
  );
}
