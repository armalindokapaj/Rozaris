"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Eye, EyeOff, Share2, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { Badge, Btn, ErrorNote, Panel, SectionHeader } from "./kit";
import type { AdminProjectRecord } from "@/hooks/useAdminProjectRecord";

export function ProjectPublishingSection({
  record,
  onChanged,
}: {
  record: AdminProjectRecord;
  onChanged: () => void;
}) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { project, approvalStatus } = record;

  async function setApproval(next: "pending" | "active" | "archived", reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/publication`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: next, reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("admin.projectVisibilityActionFailed"));
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.projectVisibilityActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!window.confirm(t("admin.projectDeleteConfirm", { name: project.name }))) return;
    const reason = window.prompt(t("admin.projectDeleteReasonPrompt"), "");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/recycle-bin/soft-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "project", entityId: project.id, reason: reason?.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("admin.projectVisibilityActionFailed"));
      }
      router.push("/admin?tab=content");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.projectVisibilityActionFailed"));
      setBusy(false);
    }
  }

  const tone = approvalStatus === "active" ? "positive" : approvalStatus === "pending" ? "warning" : "neutral";

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.publishingTitle")} description={t("projectManager.publishingDescription")} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Panel title={t("projectManager.visibilityTitle")}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={tone}>{t(`projectManager.approval.${approvalStatus}`)}</Badge>
          <p className="text-xs text-neutral-500">{t(`projectManager.approvalExplain.${approvalStatus}`)}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Btn
            variant="primary"
            disabled={busy || approvalStatus === "active"}
            onClick={() => void setApproval("active")}
          >
            <Eye className="h-3.5 w-3.5" />
            {t("projectManager.publishProject")}
          </Btn>
          <Btn
            disabled={busy || approvalStatus === "archived"}
            onClick={() => {
              const reason = window.prompt(t("admin.projectHideReasonPrompt"), t("admin.projectHideReasonDefault"));
              if (reason === null) return;
              if (!reason.trim()) {
                setError(t("admin.projectReasonRequired"));
                return;
              }
              void setApproval("archived", reason.trim());
            }}
          >
            <EyeOff className="h-3.5 w-3.5" />
            {t("projectManager.unpublishProject")}
          </Btn>
          {approvalStatus === "active" && (
            <a
              href={`/project/${project.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-control border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {t("projectManager.viewPublicPage")}
            </a>
          )}
        </div>

        <dl className="mt-4 grid gap-3 border-t border-neutral-100 pt-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-neutral-400">{t("projectManager.createdAt")}</dt>
            <dd className="font-medium text-neutral-700">{new Date(record.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">{t("projectManager.reviewedAt")}</dt>
            <dd className="font-medium text-neutral-700">
              {record.reviewedAt ? new Date(record.reviewedAt).toLocaleString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-400">{t("projectManager.inventoryRevision")}</dt>
            <dd className="font-medium tabular-nums text-neutral-700">{record.inventoryRevision ?? "—"}</dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title={t("projectManager.distributionPanelTitle")}
        description={t("projectManager.distributionPanelDescription")}
        actions={
          <Btn onClick={() => router.push(`/admin/distribution/${project.id}`)}>
            <Share2 className="h-3.5 w-3.5" />
            {t("projectManager.openDistribution")}
          </Btn>
        }
      >
        <p className="text-xs text-neutral-600">
          {t("projectManager.publishTargetCount", { count: record.counts.publishTargets })}
        </p>
      </Panel>

      <Panel title={t("projectManager.dangerZoneTitle")} description={t("projectManager.dangerZoneDescription")}>
        <Btn variant="danger" disabled={busy} onClick={() => void softDelete()}>
          <Trash2 className="h-3.5 w-3.5" />
          {t("admin.projectDelete")}
        </Btn>
      </Panel>
    </div>
  );
}
