"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { DEMO_PUBLISHER, CITY_CENTER, stageTemplate } from "@/lib/mockData";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { useLocations } from "@/hooks/useLocations";
import type { Project, ProjectSetting, PropertyType } from "@/lib/types";

const PROPERTY_TYPES: PropertyType[] = ["apartment", "villa", "studio", "commercial", "office"];
const SETTINGS: ProjectSetting[] = ["residential_complex", "beach", "tower"];

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `project-${Date.now()}`
  );
}

export function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const addProject = useAppStore((s) => s.addProject);
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const neighborhoods = useLocations(["neighborhood", "village"]);

  const [name, setName] = useState("");
  const [neighborhoodIdInput, setNeighborhoodIdInput] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [setting, setSetting] = useState<ProjectSetting>("residential_complex");
  const [buildingsInput, setBuildingsInput] = useState("A");

  const neighborhoodId = neighborhoodIdInput || neighborhoods[0]?.id || "";
  const setNeighborhoodId = setNeighborhoodIdInput;

  const selectedNeighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  const city = selectedNeighborhood?.cityName ?? "Tirana";

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const canSubmit = name.trim().length > 0 && !creating;

  async function handleCreate() {
    if (!canSubmit) return;
    setCreating(true);
    setCreateError(null);
    const buildings = buildingsInput
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);

    const project: Project = {
      id: `custom-${Date.now()}`,
      slug: slugify(name),
      name: name.trim(),
      developer: DEMO_PUBLISHER,
      status: "coming_soon",
      progressPercent: 0,
      coords:
        selectedNeighborhood?.latitude != null && selectedNeighborhood?.longitude != null
          ? { lat: selectedNeighborhood.latitude, lng: selectedNeighborhood.longitude }
          : CITY_CENTER,
      neighborhoodId: neighborhoodId || "custom",
      city,
      setting,
      propertyType,
      availableUnits: 0,
      totalUnits: 0,
      heroImage: "",
      gallery: [],
      description: { en: "", sq: "" },
      buildings: buildings.length > 0 ? buildings : ["A"],
      amenities: [],
      premium: false,
      completionLabel: "",
      units: [],
      constructionStages: stageTemplate(0),
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: project.id,
          slug: project.slug,
          name: project.name,
          publisherId: project.developer.id,
          status: project.status,
          progressPercent: project.progressPercent,
          lat: project.coords.lat,
          lng: project.coords.lng,
          neighborhoodId: project.neighborhoodId,
          city: project.city,
          setting: project.setting,
          propertyType: project.propertyType,
          heroImage: project.heroImage,
          gallery: project.gallery,
          descriptionEn: project.description.en,
          descriptionSq: project.description.sq,
          buildings: project.buildings,
          amenities: project.amenities,
          premium: project.premium,
          completionLabel: project.completionLabel,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("admin.newProjectCreateFailed"));
      }
      addProject(project);
      onCreated(project);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("admin.newProjectCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-label={t("admin.newProjectTitle")}
    >
      <div className="w-full max-w-md rounded-panel bg-white shadow-[var(--shadow-3)]">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-base font-bold text-neutral-900">{t("admin.newProjectTitle")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectName")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.newProjectNamePlaceholder")}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("admin.newProjectCity")}
              </span>
              <input
                value={city}
                readOnly
                title={t("admin.newProjectCityDerived")}
                className="w-full cursor-not-allowed rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("admin.newProjectNeighborhood")}
              </span>
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
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("admin.newProjectType")}
              </span>
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
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("admin.newProjectSetting")}
              </span>
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

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              {t("admin.newProjectBuildings")}
            </span>
            <input
              value={buildingsInput}
              onChange={(e) => setBuildingsInput(e.target.value)}
              placeholder="A, B"
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="border-t border-neutral-100 p-4">
          {createError && <p className="mb-2 text-xs text-red-600">{createError}</p>}
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {creating ? t("admin.newProjectCreating") : t("admin.newProjectCreate")}
          </button>
        </div>
      </div>
    </div>
  );
}
