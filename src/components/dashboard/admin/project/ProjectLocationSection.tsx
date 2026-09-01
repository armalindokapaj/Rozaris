"use client";

import { ArrowRight, Boxes, Crosshair, LayoutGrid, ListChecks, MapPin, Search } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useT } from "@/lib/i18n/useT";
import type { AdminProjectRecord } from "@/hooks/useAdminProjectRecord";
import { Btn, Field, Panel, SectionHeader, inputClass, readOnlyInputClass } from "./kit";
import { ProjectLocationMap } from "./ProjectLocationMap";
import type { ProjectDraft } from "./draft";
import type { ProjectSectionId } from "./sections";

export function ProjectLocationSection({
  draft,
  onChange,
  record,
  onNavigate,
}: {
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
  record: AdminProjectRecord;
  onNavigate: (section: ProjectSectionId) => void;
}) {
  const { t } = useT();
  const neighborhoods = useLocations(["neighborhood", "village"]);
  const selected = neighborhoods.find((n) => n.id === draft.neighborhoodId);
  const centreAvailable = selected?.latitude != null && selected?.longitude != null;
  const atCentre =
    centreAvailable && draft.lat === selected!.latitude && draft.lng === selected!.longitude;

  const publishedModels = record.threeD.hasMapModel;
  const modelAnchor = record.threeD.mapModelPosition;
  const anchorSplit =
    modelAnchor && (modelAnchor.lat !== draft.lat || modelAnchor.lng !== draft.lng) ? modelAnchor : null;

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.locationTitle")} description={t("projectManager.locationDescription")} />

      <Panel title={t("projectManager.canonicalLocationTitle")} description={t("projectManager.canonicalLocationDescription")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.newProjectNeighborhood")} required>
            <select
              value={draft.neighborhoodId}
              onChange={(e) => {
                const next = neighborhoods.find((n) => n.id === e.target.value);
                onChange({
                  neighborhoodId: e.target.value,
                  ...(next ? { city: next.cityName } : {}),
                });
              }}
              className={inputClass}
            >
              {                                                   
                                                              }
              {!neighborhoods.some((n) => n.id === draft.neighborhoodId) && (
                <option value={draft.neighborhoodId}>{draft.neighborhoodId || t("projectManager.locationUnset")}</option>
              )}
              {neighborhoods.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.officialName} · {n.cityName}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("admin.newProjectCity")} hint={t("admin.newProjectCityDerived")}>
            <input value={draft.city} readOnly className={readOnlyInputClass} />
          </Field>
        </div>
      </Panel>

      <Panel
        title={t("projectManager.coordinatesTitle")}
        description={t("projectManager.coordinatesDescription")}
        actions={
          centreAvailable && !atCentre ? (
            <Btn
              type="button"
              onClick={() => onChange({ lat: selected!.latitude!, lng: selected!.longitude! })}
            >
              <Crosshair className="h-3.5 w-3.5" />
              {t("projectManager.useNeighborhoodCentre")}
            </Btn>
          ) : undefined
        }
      >
        <ProjectLocationMap
          value={{ lat: draft.lat, lng: draft.lng }}
          onChange={(point) => onChange({ lat: point.lat, lng: point.lng })}
          className="mb-4"
        />
        {anchorSplit && (
          <div className="mb-4 space-y-2 rounded-control border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">{t("admin.mapModelAnchorSplit")}</p>
            <p className="text-[11px] leading-snug text-amber-700">
              {t("admin.mapModelAnchorSplitDetail", {
                lat: anchorSplit.lat.toFixed(6),
                lng: anchorSplit.lng.toFixed(6),
              })}
            </p>
            <Btn type="button" onClick={() => onChange({ lat: anchorSplit.lat, lng: anchorSplit.lng })}>
              <Crosshair className="h-3.5 w-3.5" />
              {t("admin.mapModelUseModelAnchor")}
            </Btn>
          </div>
        )}
        <p className="mb-4 flex items-start gap-1.5 text-[11px] leading-snug text-neutral-500">
          <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-brand-500" />
          {t("projectManager.pinHint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("projectManager.latitudeLabel")}>
            <input
              type="number"
              step="0.000001"
              value={draft.lat}
              onChange={(e) => onChange({ lat: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label={t("projectManager.longitudeLabel")}>
            <input
              type="number"
              step="0.000001"
              value={draft.lng}
              onChange={(e) => onChange({ lng: Number(e.target.value) })}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
        </div>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${draft.lat},${draft.lng}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />
          {t("projectManager.verifyOnMap")}
        </a>
      </Panel>

      <Panel title={t("projectManager.locationLinkedTitle")} description={t("projectManager.locationLinkedDescription")}>
        <ul className="divide-y divide-neutral-100">
          <LinkedRow
            icon={<Search className="h-4 w-4 text-neutral-400" />}
            label={t("projectManager.linkedSearchPin")}
            detail={t("projectManager.linkedSearchPinDetail")}
          />
          <LinkedRow
            icon={<Boxes className="h-4 w-4 text-neutral-400" />}
            label={t("projectManager.linkedMapModel")}
            detail={
              publishedModels
                ? t("projectManager.linkedMapModelDetail")
                : t("projectManager.linkedMapModelNone")
            }
            onOpen={() => onNavigate("mapControl")}
            openLabel={t("projectManager.navMapControl")}
          />
          <LinkedRow
            icon={<LayoutGrid className="h-4 w-4 text-neutral-400" />}
            label={t("projectManager.linkedUnits", { count: record.counts.units })}
            detail={t("projectManager.linkedUnitsDetail")}
            onOpen={() => onNavigate("inventory")}
            openLabel={t("projectManager.navInventory")}
          />
          <LinkedRow
            icon={<ListChecks className="h-4 w-4 text-neutral-400" />}
            label={t("projectManager.linkedListings", { count: record.counts.listings })}
            detail={t("projectManager.linkedListingsDetail")}
            onOpen={() => onNavigate("listings")}
            openLabel={t("projectManager.navListings")}
          />
        </ul>
      </Panel>
    </div>
  );
}

function LinkedRow({
  icon,
  label,
  detail,
  onOpen,
  openLabel,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-800">{label}</p>
        <p className="text-[11px] leading-snug text-neutral-500">{detail}</p>
      </div>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
        >
          {openLabel}
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
