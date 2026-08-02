"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { CONDITION_LABELS, AMENITY_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { mainFieldsFor } from "@/lib/propertyTypeFields";
import { cn } from "@/lib/utils";
import type { Amenity, Condition, PropertyType, Locale } from "@/lib/types";

const PROPERTY_TYPES: PropertyType[] = ["apartment", "villa", "studio", "land", "office", "commercial"];
const CONDITIONS: Condition[] = ["new", "renovated", "good", "needs_renovation"];
const AMENITIES: Amenity[] = [
  "elevator",
  "parking",
  "garage",
  "balcony",
  "terrace",
  "garden",
  "pool",
  "accessibility",
  "furnished",
];

function RequiredLabel({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-neutral-500">
      {children}
      <span className="text-brand-500" title={t("dashboard.requiredMark")}>
        *
      </span>
    </span>
  );
}

function TextField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      {required ? <RequiredLabel>{label}</RequiredLabel> : (
        <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      {required ? <RequiredLabel>{label}</RequiredLabel> : (
        <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      )}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      />
    </label>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
      )}
    >
      {children}
    </button>
  );
}

export function NewListingForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const conditionLabels = CONDITION_LABELS[locale];
  const amenityLabels = AMENITY_LABELS[locale];

  const [title, setTitle] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [price, setPrice] = useState<number | "">("");
  const [bedrooms, setBedrooms] = useState<number | "">("");
  const [bathrooms, setBathrooms] = useState<number | "">("");
  const [area, setArea] = useState<number | "">("");
  const [landSize, setLandSize] = useState<number | "">("");
  const [buildingPermit, setBuildingPermit] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionLocale, setDescriptionLocale] = useState<Locale>(locale);
  const [moreOpen, setMoreOpen] = useState(false);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [floor, setFloor] = useState<number | "">("");
  const [totalFloors, setTotalFloors] = useState<number | "">("");
  const [yearBuilt, setYearBuilt] = useState<number | "">("");
  const [negotiable, setNegotiable] = useState(false);

  const fields = mainFieldsFor(propertyType);
  const needsBedrooms = fields.includes("bedrooms");
  const needsBathrooms = fields.includes("bathrooms");
  const needsArea = fields.includes("area");
  const needsLandSize = fields.includes("landSize");
  const hasBuildingPermitField = fields.includes("buildingPermit");

  const canSave =
    title.trim() !== "" &&
    propertyType !== null &&
    price !== "" &&
    price > 0 &&
    (!needsBedrooms || (bedrooms !== "" && bedrooms > 0)) &&
    (!needsBathrooms || (bathrooms !== "" && bathrooms > 0)) &&
    (!needsArea || (area !== "" && area > 0)) &&
    (!needsLandSize || (landSize !== "" && landSize > 0)) &&
    description.trim() !== "";

  function reset() {
    setTitle("");
    setPropertyType(null);
    setPrice("");
    setBedrooms("");
    setBathrooms("");
    setArea("");
    setLandSize("");
    setBuildingPermit(false);
    setDescription("");
    setDescriptionLocale(locale);
    setMoreOpen(false);
    setCondition(null);
    setAmenities([]);
    setFloor("");
    setTotalFloors("");
    setYearBuilt("");
    setNegotiable(false);
  }

  function handleSave() {
    if (!canSave) return;
    onSaved();
    reset();
  }

  return (
    <div className="space-y-5 rounded-panel border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-bold text-neutral-900">{t("dashboard.newListingFormTitle")}</h2>

      {/* Fields appear one by one, in the order a publisher fills them in. */}
      <TextField label={t("dashboard.titleLabel")} value={title} onChange={setTitle} required />

      <div>
        <RequiredLabel>{t("filters.propertyType")}</RequiredLabel>
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_TYPES.map((pt) => (
            <Pill key={pt} active={propertyType === pt} onClick={() => setPropertyType(pt)}>
              {propertyTypeLabels[pt]}
            </Pill>
          ))}
        </div>
      </div>

      {!propertyType ? (
        <p className="text-xs text-neutral-400">{t("dashboard.selectPropertyTypeFirst")}</p>
      ) : (
        <>
          <NumberField label={t("dashboard.priceLabel")} value={price} onChange={setPrice} required />

          {needsBedrooms && (
            <NumberField label={t("filters.bedrooms")} value={bedrooms} onChange={setBedrooms} required />
          )}
          {needsBathrooms && (
            <NumberField label={t("filters.bathrooms")} value={bathrooms} onChange={setBathrooms} required />
          )}
          {needsArea && (
            <NumberField
              label={propertyType === "villa" ? t("filters.villaSizeM2") : t("filters.areaM2")}
              value={area}
              onChange={setArea}
              required
            />
          )}
          {needsLandSize && (
            <NumberField label={t("filters.landSizeM2")} value={landSize} onChange={setLandSize} required />
          )}
          {hasBuildingPermitField && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                {t("filters.buildingPermit")}
              </span>
              <Pill active={buildingPermit} onClick={() => setBuildingPermit((v) => !v)}>
                {t("filters.buildingPermit")}
              </Pill>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <RequiredLabel>{t("dashboard.descriptionLabel")}</RequiredLabel>
              <div className="flex items-center gap-1 rounded-control border border-neutral-200 p-0.5">
                {(["en", "sq"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setDescriptionLocale(l)}
                    aria-pressed={descriptionLocale === l}
                    className={cn(
                      "flex items-center gap-1 rounded-[7px] px-2 py-1 text-xs font-medium transition-colors",
                      descriptionLocale === l ? "bg-neutral-900 text-white" : "text-neutral-500"
                    )}
                  >
                    {l === "en" ? "🇬🇧 EN" : "🇦🇱 SQ"}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-neutral-400">{t("dashboard.descriptionLanguageHint")}</p>
          </div>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("dashboard.moreDetailsOptional")}
          </button>

          {moreOpen && (
            <div className="space-y-4 rounded-card bg-neutral-50 p-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  {t("filters.condition")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CONDITIONS.map((c) => (
                    <Pill key={c} active={condition === c} onClick={() => setCondition(condition === c ? null : c)}>
                      {conditionLabels[c]}
                    </Pill>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  {t("filters.amenities")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AMENITIES.map((a) => (
                    <Pill
                      key={a}
                      active={amenities.includes(a)}
                      onClick={() =>
                        setAmenities((v) => (v.includes(a) ? v.filter((x) => x !== a) : [...v, a]))
                      }
                    >
                      {amenityLabels[a]}
                    </Pill>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label={t("listing.floor")} value={floor} onChange={setFloor} />
                <NumberField label={t("dashboard.totalFloorsLabel")} value={totalFloors} onChange={setTotalFloors} />
              </div>
              <NumberField label={t("listing.yearBuilt")} value={yearBuilt} onChange={setYearBuilt} />
              <div>
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  {t("dashboard.negotiableLabel")}
                </span>
                <Pill active={negotiable} onClick={() => setNegotiable((v) => !v)}>
                  {t("dashboard.negotiableLabel")}
                </Pill>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("dashboard.saveListing")}
        </button>
        <button
          onClick={onCancel}
          className="rounded-control border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
