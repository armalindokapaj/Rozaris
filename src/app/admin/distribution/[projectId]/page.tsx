"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Rocket, ShieldCheck } from "lucide-react";
import { useAdminProject } from "@/hooks/useAdminProject";
import { useProjectReleases, type ViewerReleaseSummary } from "@/hooks/useProjectReleases";
import {
  usePublishTargets,
  type PublishTarget,
  type PublishTargetType,
  type PublishTargetStatus,
} from "@/hooks/usePublishTargets";
import { useT } from "@/lib/i18n/useT";

type TFunc = ReturnType<typeof useT>["t"];

export default function DistributionPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { project, loading } = useAdminProject(params.projectId);
  const { t } = useT();

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="h-8 w-8 animate-pulse text-neutral-300" />
        <p className="text-sm text-neutral-500">{t("admin.loading")}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="h-8 w-8 text-neutral-300" />
        <p className="text-sm text-neutral-500">{t("admin.projectNotFound")}</p>
        <button
          onClick={() => router.push("/admin?tab=experience")}
          className="text-sm font-semibold text-brand-600 hover:underline"
        >
          {t("admin.backToAdminConsole")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto scroll-thin px-5 py-8">
      <button
        onClick={() => router.push("/admin?tab=experience")}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("admin.backToAdminConsole")}
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-bold text-neutral-900">{t("admin.distributionTitle")}</h1>
        <p className="truncate text-xs text-neutral-500">{project.name}</p>
      </div>

      <ReleasesSection projectId={project.id} t={t} />
      <div className="my-8 border-t border-neutral-100" />
      <TargetsSection projectId={project.id} t={t} />
    </div>
  );
}

function ReleasesSection({ projectId, t }: { projectId: string; t: TFunc }) {
  const { releases, readiness, error, creating, createRelease } = useProjectReleases(projectId);

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-neutral-900">{t("admin.distributionReleasesSectionTitle")}</h2>

      {readiness && (
        <div
          className={`mb-3 rounded-control border p-3 text-xs ${
            readiness.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className={`font-semibold ${readiness.ready ? "text-emerald-700" : "text-amber-700"}`}>
            {readiness.ready ? t("admin.distributionReadinessReady") : t("admin.distributionReadinessNotReady")}
          </p>
          {readiness.blocking.length > 0 && (
            <div className="mt-1.5">
              <p className="font-semibold text-red-700">{t("admin.distributionBlockingTitle")}</p>
              <ul className="ml-4 list-disc text-red-600">
                {readiness.blocking.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {readiness.warnings.length > 0 && (
            <div className="mt-1.5">
              <p className="font-semibold text-amber-700">{t("admin.distributionWarningsTitle")}</p>
              <ul className="ml-4 list-disc text-amber-700">
                {readiness.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-2 text-xs font-medium text-red-600">{error}</p>}

      <button
        onClick={createRelease}
        disabled={!readiness?.ready || creating}
        className="mb-3 flex items-center justify-center gap-1.5 rounded-control bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
      >
        <Rocket className="h-3.5 w-3.5" />
        {creating ? t("admin.distributionCreatingRelease") : t("admin.distributionCreateRelease")}
      </button>

      {releases === null ? (
        <p className="text-xs text-neutral-400">{t("admin.loading")}</p>
      ) : releases.length === 0 ? (
        <p className="rounded-control border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
          {t("admin.distributionNoReleasesYet")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {releases.map((r) => (
            <ReleaseRow key={r.id} release={r} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReleaseRow({ release, t }: { release: ViewerReleaseSummary; t: TFunc }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-control border border-neutral-200 p-2.5 text-xs">
      <div className="min-w-0">
        <span className="font-semibold text-neutral-900">v{release.version}</span>
        <span className="ml-2 font-mono text-neutral-400">{release.manifestHash.slice(0, 12)}…</span>
        {release.createdBy && (
          <span className="ml-2 text-neutral-400">
            {t("admin.distributionReleaseCreatedBy", { actor: release.createdBy })}
          </span>
        )}
      </div>
      <span className="shrink-0 text-neutral-400">{new Date(release.createdAt).toLocaleString()}</span>
    </div>
  );
}

function targetStatusLabel(status: PublishTargetStatus, t: TFunc): string {
  switch (status) {
    case "draft":
      return t("admin.distributionTargetStatusDraft");
    case "active":
      return t("admin.distributionTargetStatusActive");
    case "suspended":
      return t("admin.distributionTargetStatusSuspended");
    case "expired":
      return t("admin.distributionTargetStatusExpired");
  }
}

const STATUS_BADGE_CLASSES: Record<PublishTargetStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
};

function targetTypeLabel(type: PublishTargetType, t: TFunc): string {
  switch (type) {
    case "marketplace":
      return t("admin.distributionTargetTypeMarketplace");
    case "embed":
      return t("admin.distributionTargetTypeEmbed");
    case "custom_domain":
      return t("admin.distributionTargetTypeCustomDomain");
    case "kiosk":
      return t("admin.distributionTargetTypeKiosk");
  }
}

function TargetsSection({ projectId, t }: { projectId: string; t: TFunc }) {
  const { targets, error, createTarget, updateTarget, deleteTarget, deployRelease } = usePublishTargets(projectId);
  const { releases } = useProjectReleases(projectId);

  const [name, setName] = useState("");
  const [type, setType] = useState<PublishTargetType>("embed");
  const [originsText, setOriginsText] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    const allowedOrigins = originsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = await createTarget({
      type,
      name: name.trim(),
      allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    });
    if (ok) {
      setName("");
      setOriginsText("");
    }
  }

  async function handleActivate(target: PublishTarget) {
    await updateTarget(target.id, { status: "active" });
  }

  async function handleSuspend(target: PublishTarget) {
    const reason = window.prompt(t("admin.distributionSuspendReasonPrompt"), "");
    if (reason === null) return;
    await updateTarget(target.id, { status: "suspended", reason: reason || undefined });
  }

  async function handleDelete(target: PublishTarget) {
    if (!window.confirm(t("admin.distributionDeleteTargetConfirm", { name: target.name }))) return;
    await deleteTarget(target.id);
  }

  async function handleDeploy(target: PublishTarget) {
    const versionStr = window.prompt(t("admin.distributionDeploySelectPrompt", { name: target.name }), "");
    if (!versionStr) return;
    const version = Number(versionStr);
    const release = (releases ?? []).find((r) => r.version === version);
    if (!release) {
      window.alert(t("admin.distributionDeployInvalidVersion"));
      return;
    }
    await deployRelease(target.id, release.id);
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-neutral-900">{t("admin.distributionTargetsSectionTitle")}</h2>
      {error && <p className="mb-2 text-xs font-medium text-red-600">{error}</p>}

      {targets === null ? (
        <p className="text-xs text-neutral-400">{t("admin.loading")}</p>
      ) : targets.length === 0 ? (
        <p className="mb-3 rounded-control border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
          {t("admin.distributionNoTargetsYet")}
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {targets.map((target) => (
            <div key={target.id} className="rounded-control border border-neutral-200 p-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-neutral-900">{target.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASSES[target.status]}`}
                >
                  {targetStatusLabel(target.status, t)}
                </span>
              </div>
              <p className="mt-0.5 text-neutral-400">{targetTypeLabel(target.type, t)}</p>
              <p className="mt-1 text-neutral-500">
                {t("admin.distributionCurrentRelease")}:{" "}
                {(() => {
                  const current = (releases ?? []).find((r) => r.id === target.activeReleaseId);
                  return current ? `v${current.version}` : t("admin.distributionNoReleaseDeployed");
                })()}
              </p>
              {target.allowedOrigins.length > 0 && (
                <p className="mt-0.5 truncate text-neutral-400">{target.allowedOrigins.join(", ")}</p>
              )}
              <p className="mt-1 truncate font-mono text-[10px] text-neutral-300">
                {t("admin.distributionPublicKeyLabel")}: {target.publicKey}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleDeploy(target)}
                  className="rounded-control border border-neutral-300 bg-white px-2.5 py-1 font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  {t("admin.distributionDeploy")}
                </button>
                {target.status !== "active" && (
                  <button
                    onClick={() => handleActivate(target)}
                    className="rounded-control border border-emerald-300 bg-white px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    {t("admin.distributionActivate")}
                  </button>
                )}
                {target.status === "active" && (
                  <button
                    onClick={() => handleSuspend(target)}
                    className="rounded-control border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-700 hover:bg-amber-50"
                  >
                    {t("admin.distributionSuspend")}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(target)}
                  className="rounded-control border border-red-200 bg-white px-2.5 py-1 font-semibold text-red-600 hover:bg-red-50"
                >
                  {t("admin.distributionDeleteTarget")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2.5 rounded-control border border-neutral-200 bg-neutral-50 p-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t("admin.distributionTargetType")}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PublishTargetType)}
              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
            >
              <option value="marketplace">{t("admin.distributionTargetTypeMarketplace")}</option>
              <option value="embed">{t("admin.distributionTargetTypeEmbed")}</option>
              <option value="custom_domain">{t("admin.distributionTargetTypeCustomDomain")}</option>
              <option value="kiosk">{t("admin.distributionTargetTypeKiosk")}</option>
            </select>
          </Field>
          <Field label={t("admin.distributionAddTarget")}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.distributionTargetNamePlaceholder")}
              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
            />
          </Field>
        </div>
        {type === "embed" && (
          <Field label={t("admin.distributionTargetAllowedOrigins")}>
            <textarea
              value={originsText}
              onChange={(e) => setOriginsText(e.target.value)}
              rows={2}
              placeholder="https://client-site.com"
              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
            />
          </Field>
        )}
        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-control bg-brand-500 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("admin.distributionAddTarget")}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
