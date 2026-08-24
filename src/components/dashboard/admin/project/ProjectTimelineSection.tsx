"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { ProjectTimelinePanel } from "@/components/dashboard/admin/ProjectTimelinePanel";
import { Btn, EmptyState, ErrorNote, Panel, SectionHeader, narrowInputClass } from "./kit";
import type { ConstructionStage, Project } from "@/lib/types";

type StageDraft = Pick<ConstructionStage, "name" | "status" | "progressPercent" | "dateLabel">;

const STATUSES: ConstructionStage["status"][] = ["done", "active", "upcoming"];

/** Offered as a starting point for a project with no timeline at all —
 * the five phases every development here goes through, so the first
 * timeline is four edits rather than five blank rows. */
const STARTER: StageDraft[] = [
  { name: "Foundations", status: "done", progressPercent: 100, dateLabel: "" },
  { name: "Structure", status: "active", progressPercent: 50, dateLabel: "" },
  { name: "Façade", status: "upcoming", progressPercent: 0, dateLabel: "" },
  { name: "Interiors", status: "upcoming", progressPercent: 0, dateLabel: "" },
  { name: "Handover", status: "upcoming", progressPercent: 0, dateLabel: "" },
];

/**
 * Project Manager → "Timeline". Two related things in one place:
 *
 * 1. The real `ConstructionStage` rows shown on the public project page —
 *    editable here for the first time (they were seed-only until the
 *    `construction-stages` route landed with this section).
 * 2. The publisher's pending progress-change requests
 *    (`ProjectTimelinePanel`, unchanged), which is the OTHER direction:
 *    them asking, an admin approving.
 *
 * Saved on its own button rather than through the record save bar — these
 * are separate rows in a separate table behind a separate endpoint, and
 * folding them into the `Project` upsert would mean one Save doing two
 * unrelated writes that can fail independently.
 */
export function ProjectTimelineSection({ project }: { project: Project }) {
  const { t } = useT();
  const [stages, setStages] = useState<StageDraft[] | null>(null);
  const [saved, setSaved] = useState<StageDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/projects/${project.id}/construction-stages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ConstructionStage[]) => {
        if (cancelled) return;
        const draft = rows.map(({ name, status, progressPercent, dateLabel }) => ({ name, status, progressPercent, dateLabel }));
        setStages(draft);
        setSaved(draft);
      })
      .catch(() => {
        if (!cancelled) setStages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const dirty = stages !== null && JSON.stringify(stages) !== JSON.stringify(saved);

  function patch(index: number, next: Partial<StageDraft>) {
    setStages((prev) => (prev ?? []).map((s, i) => (i === index ? { ...s, ...next } : s)));
  }

  function move(index: number, delta: number) {
    setStages((prev) => {
      const next = [...(prev ?? [])];
      const target = index + delta;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (!stages) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/construction-stages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : t("projectManager.stagesSaveFailed"));
      }
      const next = (body as ConstructionStage[]).map(({ name, status, progressPercent, dateLabel }) => ({
        name,
        status,
        progressPercent,
        dateLabel,
      }));
      setStages(next);
      setSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectManager.stagesSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.timelineTitle")} description={t("projectManager.timelineDescription")} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Panel
        title={t("projectManager.stagesTitle")}
        description={t("projectManager.stagesDescription")}
        actions={
          <>
            {stages?.length === 0 && (
              <Btn onClick={() => setStages(STARTER)}>{t("projectManager.useStarterTimeline")}</Btn>
            )}
            <Btn
              onClick={() =>
                setStages([...(stages ?? []), { name: "", status: "upcoming", progressPercent: 0, dateLabel: "" }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t("projectManager.addStage")}
            </Btn>
          </>
        }
      >
        {stages === null ? (
          <p className="py-4 text-center text-xs text-neutral-400">{t("admin.loading")}</p>
        ) : stages.length === 0 ? (
          <EmptyState>{t("projectManager.noStages")}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {stages.map((stage, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-200 p-2">
                <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-neutral-400">
                  {index + 1}
                </span>
                <input
                  value={stage.name}
                  onChange={(e) => patch(index, { name: e.target.value })}
                  placeholder={t("projectManager.stageNamePlaceholder")}
                  className={`${narrowInputClass} min-w-[140px] flex-1`}
                />
                <select
                  value={stage.status}
                  onChange={(e) => patch(index, { status: e.target.value as ConstructionStage["status"] })}
                  className={narrowInputClass}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`projectManager.stageStatus.${s}`)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={stage.progressPercent}
                  onChange={(e) =>
                    patch(index, { progressPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                  }
                  title={t("admin.progressPercentLabel")}
                  className={`${narrowInputClass} w-20 text-right tabular-nums`}
                />
                <input
                  value={stage.dateLabel}
                  onChange={(e) => patch(index, { dateLabel: e.target.value })}
                  placeholder={t("projectManager.stageDatePlaceholder")}
                  className={`${narrowInputClass} w-28`}
                />
                <div className="flex shrink-0 gap-0.5">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t("projectManager.moveEarlier")}
                    className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === stages.length - 1}
                    aria-label={t("projectManager.moveLater")}
                    className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setStages(stages.filter((_, i) => i !== index))}
                    aria-label={t("projectManager.removeStage")}
                    className="rounded-control p-1.5 text-neutral-500 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {dirty && (
          <div className="mt-3 flex items-center gap-1.5 border-t border-neutral-100 pt-3">
            <Btn
              variant="primary"
              onClick={() => void save()}
              disabled={busy || (stages ?? []).some((s) => !s.name.trim())}
            >
              {busy ? t("common.loading") : t("projectManager.saveTimeline")}
            </Btn>
            <Btn onClick={() => setStages(saved)} disabled={busy}>
              {t("projectManager.discardChanges")}
            </Btn>
            {(stages ?? []).some((s) => !s.name.trim()) && (
              <span className="text-xs text-amber-700">{t("projectManager.stageNeedsName")}</span>
            )}
          </div>
        )}
      </Panel>

      <ProjectTimelinePanel project={project} />
      <p className="text-xs text-neutral-400">{t("projectManager.timelineNote")}</p>
    </div>
  );
}
