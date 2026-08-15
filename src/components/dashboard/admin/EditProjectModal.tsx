"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { useLocations } from "@/hooks/useLocations";
import type { Project, ProjectSetting, PropertyType } from "@/lib/types";

const PROPERTY_TYPES: PropertyType[] = ["apartment", "villa", "studio", "commercial", "office"];
const SETTINGS: ProjectSetting[] = ["residential_complex", "beach", "tower"];
const STATUSES: Project["status"][] = ["coming_soon", "under_construction", "completed"];

interface PublisherOption {
  id: string;
  name: string;
}

/**
 * Project Management's "General Information / Developer / Location /
 * Buildings / Media / Amenities / Publishing" editor for an EXISTING
 * project — `NewProjectModal` only ever created one with a bare identity
 * (name/city/neighborhood/type/setting/buildings), with every other real
 * column (amenities, hero image, gallery, both descriptions, premium,
 * completion label, construction status/progress, developer) left at its
 * empty default forever, since nothing could write to them again. This
 * reuses the exact same upsert-by-id route (`POST /api/projects`) that
 * route's own doc comment already documents as "creates/updates" — the
 * gap was purely a missing UI, not a missing route.
 */
export function EditProjectModal({
  project,
  publishers,
  onClose,
  onSaved,
}: {
  project: Project;
  publishers: PublisherOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const neighborhoods = useLocations("neighborhood");

  const [name, setName] = useState(project.name);
  const [neighborhoodId, setNeighborhoodId] = useState(project.neighborhoodId);
  const [propertyType, setPropertyType] = useState<PropertyType>(project.propertyType);
  const [setting, setSetting] = useState<ProjectSetting>(project.setting);
  const [status, setStatus] = useState<Project["status"]>(project.status);
  const [progressPercent, setProgressPercent] = useState(project.progressPercent);
  const [buildingsInput, setBuildingsInput] = useState(project.buildings.join(", "));
  const [amenitiesInput, setAmenitiesInput] = useState(project.amenities.join(", "));
  const [heroImage, setHeroImage] = useState(project.heroImage);
  const [completionLabel, setCompletionLabel] = useState(project.completionLabel);
  const [premium, setPremium] = useState(project.premium);
  const [descriptionEn, setDescriptionEn] = useState(project.description.en);
  const [descriptionSq, setDescriptionSq] = useState(project.description.sq);
  const [publisherId, setPublisherId] = useState(project.developer.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // City is derived from the selected canonical neighborhood, never
  // free-typed — the "no custom location field" rule from the Canonical
  // Location System spec (see MEMORY note "rozaris-controlled-taxonomy-spec").
  // Falls back to the project's existing `city` string until the real list
  // has loaded (`useLocations` starts empty) or if this project's
  // neighborhoodId predates the seeded Location rows.
  const selectedNeighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  const city = selectedNeighborhood?.cityName ?? project.city;

  const canSubmit = name.trim().length > 0;

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: project.id,
          slug: project.slug,
          name: name.trim(),
          publisherId,
          status,
          progressPercent,
          lat:
            selectedNeighborhood?.latitude != null && selectedNeighborhood?.longitude != null
              ? selectedNeighborhood.latitude
              : project.coords.lat,
          lng:
            selectedNeighborhood?.latitude != null && selectedNeighborhood?.longitude != null
              ? selectedNeighborhood.longitude
              : project.coords.lng,
          neighborhoodId,
          city,
          setting,
          propertyType,
          heroImage,
          gallery: project.gallery,
          descriptionEn,
          descriptionSq,
          buildings: buildingsInput
            .split(",")
            .map((b) => b.trim())
            .filter(Boolean),
          amenities: amenitiesInput
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          premium,
          completionLabel,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ? JSON.stringify(b.error) : "Save failed.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-label={t("admin.editProjectTitle")}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-panel bg-white shadow-[var(--shadow-3)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-100 bg-white px-5 py-4">
          <h2 className="text-base font-bold text-neutral-900">{t("admin.editProjectTitle", { name: project.name })}</h2>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectDeveloper")}</span>
            <select
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            >
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectCity")}</span>
              <input
                value={city}
                readOnly
                title={t("admin.newProjectCityDerived")}
                className="w-full cursor-not-allowed rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectNeighborhood")}</span>
              <select
                value={neighborhoodId}
                onChange={(e) => setNeighborhoodId(e.target.value)}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.officialName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectType")}</span>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                {PROPERTY_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {propertyTypeLabels[pt]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectSetting")}</span>
              <select
                value={setting}
                onChange={(e) => setSetting(e.target.value as ProjectSetting)}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                {SETTINGS.map((s) => (
                  <option key={s} value={s}>
                    {t(`newProjectsPage.setting${s === "residential_complex" ? "ResidentialComplex" : s[0].toUpperCase() + s.slice(1)}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.constructionStatusLabel")}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Project["status"])}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`admin.constructionStatus.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.progressPercentLabel")}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={progressPercent}
                onChange={(e) => setProgressPercent(Number(e.target.value))}
                className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newProjectBuildings")}</span>
            <input
              value={buildingsInput}
              onChange={(e) => setBuildingsInput(e.target.value)}
              placeholder="A, B"
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.amenitiesLabel")}</span>
            <input
              value={amenitiesInput}
              onChange={(e) => setAmenitiesInput(e.target.value)}
              placeholder="pool, gym, parking"
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.heroImageLabel")}</span>
            <input
              value={heroImage}
              onChange={(e) => setHeroImage(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.completionLabelLabel")}</span>
            <input
              value={completionLabel}
              onChange={(e) => setCompletionLabel(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.descriptionEnLabel")}</span>
            <textarea
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              rows={3}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.descriptionSqLabel")}</span>
            <textarea
              value={descriptionSq}
              onChange={(e) => setDescriptionSq(e.target.value)}
              rows={3}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
            <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} />
            {t("admin.premiumBadge")}
          </label>
        </div>

        <div className="border-t border-neutral-100 p-4">
          <button
            onClick={handleSave}
            disabled={!canSubmit || saving}
            className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
