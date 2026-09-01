"use client";

import { useT } from "@/lib/i18n/useT";
import { AMENITY_KEYS, AMENITY_LABELS } from "@/lib/constants";
import { ChipEditor, Panel, SectionHeader } from "./kit";
import type { ProjectDraft } from "./draft";
import type { Amenity } from "@/lib/types";

export function ProjectFeaturesSection({
  draft,
  onChange,
}: {
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
}) {
  const { t, locale } = useT();
  const labels = AMENITY_LABELS[locale];

  function toggleAmenity(amenity: Amenity) {
    onChange({
      amenities: draft.amenities.includes(amenity)
        ? draft.amenities.filter((a) => a !== amenity)
        : [...draft.amenities, amenity],
    });
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.featuresTitle")} description={t("projectManager.featuresDescription")} />

      <Panel title={t("admin.newProjectBuildings")} description={t("projectManager.buildingsDescription")}>
        <ChipEditor
          values={draft.buildings}
          onChange={(buildings) => onChange({ buildings })}
          placeholder={t("projectManager.buildingPlaceholder")}
          addLabel={t("projectManager.add")}
          emptyLabel={t("projectManager.buildingsEmpty")}
        />
      </Panel>

      <Panel title={t("admin.amenitiesLabel")} description={t("projectManager.amenitiesDescription")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AMENITY_KEYS.map((amenity) => {
            const on = draft.amenities.includes(amenity);
            return (
              <label
                key={amenity}
                className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2.5 text-sm font-medium transition-colors ${
                  on
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggleAmenity(amenity)} />
                {labels[amenity]}
              </label>
            );
          })}
        </div>
        {                                                                
                                          }
        {draft.amenities.some((a) => !AMENITY_KEYS.includes(a)) && (
          <div className="mt-3 rounded-control border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-800">{t("projectManager.unknownAmenitiesTitle")}</p>
            <div className="flex flex-wrap gap-1.5">
              {draft.amenities
                .filter((a) => !AMENITY_KEYS.includes(a))
                .map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onChange({ amenities: draft.amenities.filter((x) => x !== a) })}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-3 pr-2 text-xs font-medium text-amber-800"
                  >
                    {a} <span className="text-amber-500">×</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
