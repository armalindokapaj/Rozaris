"use client";

import { Crosshair, MapPin } from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useT } from "@/lib/i18n/useT";
import { Btn, Field, Panel, SectionHeader, inputClass, readOnlyInputClass } from "./kit";
import type { ProjectDraft } from "./draft";

/**
 * Project Manager → "Location". The canonical-location rule from the
 * Controlled Taxonomy spec still holds — a project's neighborhood is
 * PICKED from the real `Location` table, never free-typed, and `city` is
 * derived from that pick rather than entered — but coordinates are now
 * editable.
 *
 * That's a deliberate change from the old modal, which silently overwrote
 * lat/lng with the selected neighborhood's centre on every save: a
 * development is a specific site, not the middle of Ish-Blloku, and the
 * map pin, the 3D map model's anchor and the "hide this building
 * footprint" logic all read these exact numbers. Picking a neighborhood
 * still offers its centre as a starting point — as an explicit button,
 * not a silent overwrite of coordinates someone placed on purpose.
 */
export function ProjectLocationSection({
  draft,
  onChange,
}: {
  draft: ProjectDraft;
  onChange: (patch: Partial<ProjectDraft>) => void;
}) {
  const { t } = useT();
  // Both levels — a development can sit directly in a Village with no
  // neighborhood layer at all (2026-08-21 spec).
  const neighborhoods = useLocations(["neighborhood", "village"]);
  const selected = neighborhoods.find((n) => n.id === draft.neighborhoodId);
  const centreAvailable = selected?.latitude != null && selected?.longitude != null;
  const atCentre =
    centreAvailable && draft.lat === selected!.latitude && draft.lng === selected!.longitude;

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
                  // City follows the pick — it's derived, never authored.
                  ...(next ? { city: next.cityName } : {}),
                });
              }}
              className={inputClass}
            >
              {/* Same guard as the developer picker: never let an
                  unresolved id silently display (and then save) as
                  whichever location happens to sort first. */}
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
    </div>
  );
}
