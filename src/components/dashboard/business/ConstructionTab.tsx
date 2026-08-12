"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { ConstructionTimelineEditor } from "@/components/dashboard/ConstructionTimelineEditor";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import type { Project } from "@/lib/types";

/** Business Publisher's Construction management surface
 * (PRD_ROZARIS_User_Types §4 "Construction") — current %, phase and update
 * history per project. Updates "may require Admin approval" per the PRD;
 * this reuses the existing submit→admin-approve ConstructionTimelineRequest
 * flow (ConstructionTimelineEditor / TimelineTab in the Admin console)
 * rather than inventing a second approval mechanism. */
export function ConstructionTab({ projects }: { projects: Project[] }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.tabConstruction")}</h1>
        <p className="text-sm text-neutral-500">{t("construction.subtitle")}</p>
      </div>
      {projects.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("construction.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ConstructionProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConstructionProjectCard({ project }: { project: Project }) {
  const { t } = useT();
  const live = useProjectConstruction(project);
  const timelineRequests = useAppStore((s) => s.timelineRequests);
  const hasPending = timelineRequests.some((r) => r.projectId === project.id && r.status === "pending");
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/project/${project.slug}`} className="font-semibold text-neutral-900 hover:text-brand-600">
          {project.name}
        </Link>
        <div className="flex items-center gap-3">
          {hasPending && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {t("dashboard.timelinePendingBadge")}
            </span>
          )}
          <button
            onClick={() => setEditorOpen((v) => !v)}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("dashboard.editTimeline")}
          </button>
        </div>
      </div>

      <div className="mt-3">
        <ConstructionTimelineStrip stages={live.stages} overallPercent={live.progressPercent} compact />
      </div>

      {editorOpen && (
        <div className="mt-4">
          <ConstructionTimelineEditor project={project} />
        </div>
      )}
    </div>
  );
}
