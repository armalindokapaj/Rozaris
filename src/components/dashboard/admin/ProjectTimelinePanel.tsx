"use client";

import { Check, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

/**
 * The former standalone "Timeline" admin tab (`TimelineTab`), nested inside
 * a single Project's `EditProjectModal` instead — a publisher's proposed
 * construction-progress update is reviewed in the same place admin already
 * edits that project's own `progressPercent` directly, rather than a
 * separate cross-project queue elsewhere in the nav. Filters the same
 * Zustand `timelineRequests`/`projectConstructionOverrides` this always
 * read from (still mock — no real backend for this queue exists yet,
 * unaffected by this move) down to this one project.
 */
export function ProjectTimelinePanel({ project }: { project: Project }) {
  const { t } = useT();
  const timelineRequests = useAppStore((s) => s.timelineRequests);
  const overrides = useAppStore((s) => s.projectConstructionOverrides);
  const approveTimelineRequest = useAppStore((s) => s.approveTimelineRequest);
  const rejectTimelineRequest = useAppStore((s) => s.rejectTimelineRequest);

  const forProject = timelineRequests.filter((r) => r.projectId === project.id);
  const pending = forProject.filter((r) => r.status === "pending");
  const decided = forProject.filter((r) => r.status !== "pending");

  const livePercent = overrides[project.id]?.progressPercent ?? project.progressPercent;

  if (forProject.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-neutral-200 pt-4">
      <h3 className="text-sm font-bold text-neutral-900">{t("admin.timelineQueueTitle")}</h3>

      {pending.length === 0 ? (
        <p className="rounded-control border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
          {t("admin.timelineQueueClear")}
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-neutral-200 bg-white p-3"
            >
              <p className="text-xs text-neutral-600">
                {t("admin.timelineRequestSummary", {
                  name: r.publisherName,
                  percent: r.draft.progressPercent,
                  livePercent,
                })}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => approveTimelineRequest(r.id)}
                  className="flex items-center gap-1.5 rounded-control bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                </button>
                <button
                  type="button"
                  onClick={() => rejectTimelineRequest(r.id)}
                  className="flex items-center gap-1.5 rounded-control border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="space-y-1.5">
          {decided.slice(0, 8).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-control border border-neutral-100 px-3 py-2 text-xs"
            >
              <span className="text-neutral-600">{r.draft.progressPercent}%</span>
              <span className={cn("font-semibold", r.status === "approved" ? "text-green-600" : "text-red-500")}>
                {r.status === "approved" ? t("admin.timelineApproved") : t("admin.timelineRejected")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
