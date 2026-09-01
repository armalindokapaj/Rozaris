"use client";

import { ExternalLink } from "lucide-react";
import { MapModelEditor } from "@/components/dashboard/MapModelEditor";
import { useT } from "@/lib/i18n/useT";
import type { Project } from "@/lib/types";
import { Btn, SectionHeader } from "./kit";
import type { ProjectDraft } from "./draft";

export function ProjectMapControlSection({
  project,
  draft,
  onChange,
  savedAt,
}: {
  project: Project;
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
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
        />
      </div>
    </div>
  );
}
