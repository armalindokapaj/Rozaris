"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { stageTemplate } from "@/lib/mockData";
import { useT } from "@/lib/i18n/useT";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import type { Project } from "@/lib/types";

export function ConstructionTimelineEditor({ project }: { project: Project }) {
  const { t } = useT();
  const live = useProjectConstruction(project);
  const timelineRequests = useAppStore((s) => s.timelineRequests);
  const submitTimelineRequest = useAppStore((s) => s.submitTimelineRequest);
  const [percent, setPercent] = useState(live.progressPercent);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const pendingRequest = timelineRequests.find(
    (r) => r.projectId === project.id && r.status === "pending"
  );

  function handleSubmit() {
    submitTimelineRequest(project.id, project.name, {
      progressPercent: percent,
      stages: stageTemplate(percent),
    });
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 3000);
  }

  return (
    <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">{t("dashboard.editTimeline")}</h3>
          <p className="text-xs text-neutral-500">{t("dashboard.timelineEditorSubtitle")}</p>
        </div>
        <span className="text-xs font-medium text-neutral-500">
          {t("dashboard.timelineLastApproved", { percent: live.progressPercent })}
        </span>
      </div>

      {pendingRequest && (
        <p className="flex items-center gap-1.5 rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          {t("dashboard.timelinePendingBadge")} · {pendingRequest.draft.progressPercent}%
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
          {t("dashboard.timelineOverallProgress")}
          <span className="font-semibold text-neutral-800">{percent}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </label>

      <ConstructionTimelineStrip stages={stageTemplate(percent)} overallPercent={percent} />

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          {t("dashboard.timelineSubmit")}
        </button>
        {justSubmitted && (
          <p className="text-xs font-medium text-green-700">{t("dashboard.timelineSubmitted")}</p>
        )}
      </div>
    </div>
  );
}
