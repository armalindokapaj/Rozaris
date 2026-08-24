"use client";

import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { Field, Panel, SectionHeader, inputClass, narrowInputClass, readOnlyInputClass, Btn } from "./kit";
import { slugify, type ProjectDraft } from "./draft";
import type { Project, ProjectSetting, PropertyType } from "@/lib/types";

const PROPERTY_TYPES: PropertyType[] = ["apartment", "villa", "studio", "commercial", "office"];
const SETTINGS: ProjectSetting[] = ["residential_complex", "beach", "tower"];
const STATUSES: Project["status"][] = ["coming_soon", "under_construction", "completed"];

interface PublisherOption {
  id: string;
  name: string;
}

/**
 * Project Manager → "General". Identity (name/slug/developer),
 * classification (type/setting), construction state, and both
 * descriptions. Everything here writes into the shared record draft; the
 * page's save bar commits it.
 *
 * `slug` is editable for the first time (the old modal always sent the
 * project's existing slug back unchanged, so a typo made at creation was
 * permanent) — with the live public URL shown underneath and an explicit
 * warning, because changing it breaks every link anyone has already
 * shared. The upsert route de-duplicates a colliding slug rather than
 * failing, so a clash costs a suffix, not an error.
 */
export function ProjectGeneralSection({
  draft,
  onChange,
  publishers,
  project,
}: {
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
  publishers: PublisherOption[];
  project: Project;
}) {
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const slugChanged = draft.slug !== project.slug;

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.generalTitle")} description={t("projectManager.generalDescription")} />

      <Panel title={t("projectManager.identityTitle")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.newProjectName")} required>
            <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} className={inputClass} />
          </Field>

          <Field
            label={t("projectManager.slugLabel")}
            hint={
              slugChanged
                ? t("projectManager.slugChangedWarning", { old: project.slug })
                : t("projectManager.slugHint", { url: `/project/${draft.slug}` })
            }
          >
            <div className="flex gap-1.5">
              <input
                value={draft.slug}
                onChange={(e) => onChange({ slug: e.target.value })}
                className={inputClass}
                spellCheck={false}
              />
              <Btn
                type="button"
                onClick={() => onChange({ slug: slugify(draft.name) })}
                title={t("projectManager.slugRegenerate")}
                className="shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Btn>
            </div>
          </Field>

          <Field label={t("admin.newProjectDeveloper")} required>
            <select
              value={draft.publisherId}
              onChange={(e) => onChange({ publisherId: e.target.value })}
              className={inputClass}
            >
              {/* A project whose publisher isn't in the loaded list (a
                  publisher that was archived, say) would otherwise show
                  the FIRST option as if it were the real one, and a save
                  would silently reassign the project to it. */}
              {!publishers.some((p) => p.id === draft.publisherId) && (
                <option value={draft.publisherId}>{project.developer.name}</option>
              )}
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("projectManager.projectIdLabel")} hint={t("projectManager.projectIdHint")}>
            <input value={project.id} readOnly className={readOnlyInputClass} />
          </Field>
        </div>
      </Panel>

      <Panel title={t("projectManager.classificationTitle")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.newProjectType")}>
            <select
              value={draft.propertyType}
              onChange={(e) => onChange({ propertyType: e.target.value as PropertyType })}
              className={inputClass}
            >
              {PROPERTY_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {propertyTypeLabels[pt]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("admin.newProjectSetting")}>
            <select
              value={draft.setting}
              onChange={(e) => onChange({ setting: e.target.value as ProjectSetting })}
              className={inputClass}
            >
              {SETTINGS.map((s) => (
                <option key={s} value={s}>
                  {t(`newProjectsPage.setting${s === "residential_complex" ? "ResidentialComplex" : s[0].toUpperCase() + s.slice(1)}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("projectManager.premiumLabel")} hint={t("projectManager.premiumHint")}>
            <label className="flex h-[38px] items-center gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={draft.premium}
                onChange={(e) => onChange({ premium: e.target.checked })}
              />
              {t("admin.premiumBadge")}
            </label>
          </Field>

          <Field label={t("admin.completionLabelLabel")} hint={t("projectManager.completionHint")}>
            <input
              value={draft.completionLabel}
              onChange={(e) => onChange({ completionLabel: e.target.value })}
              placeholder="Q4 2027"
              className={inputClass}
            />
          </Field>
        </div>
      </Panel>

      <Panel title={t("projectManager.constructionTitle")} description={t("projectManager.constructionDescription")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.constructionStatusLabel")}>
            <select
              value={draft.status}
              onChange={(e) => onChange({ status: e.target.value as Project["status"] })}
              className={inputClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.constructionStatus.${s}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("admin.progressPercentLabel")}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={draft.progressPercent}
                onChange={(e) => onChange({ progressPercent: Number(e.target.value) })}
                className="flex-1 accent-[var(--color-brand-500)]"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={draft.progressPercent}
                onChange={(e) =>
                  onChange({ progressPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                }
                className={`${narrowInputClass} w-20 shrink-0 text-right tabular-nums`}
              />
            </div>
          </Field>
        </div>
      </Panel>

      <Panel title={t("projectManager.descriptionsTitle")} description={t("projectManager.descriptionsDescription")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label={t("admin.descriptionEnLabel")}>
            <textarea
              value={draft.descriptionEn}
              onChange={(e) => onChange({ descriptionEn: e.target.value })}
              rows={7}
              className={inputClass}
            />
            <span className="mt-1 block text-right text-[11px] tabular-nums text-neutral-400">
              {draft.descriptionEn.length}
            </span>
          </Field>
          <Field label={t("admin.descriptionSqLabel")}>
            <textarea
              value={draft.descriptionSq}
              onChange={(e) => onChange({ descriptionSq: e.target.value })}
              rows={7}
              className={inputClass}
            />
            <span className="mt-1 block text-right text-[11px] tabular-nums text-neutral-400">
              {draft.descriptionSq.length}
            </span>
          </Field>
        </div>
      </Panel>
    </div>
  );
}
