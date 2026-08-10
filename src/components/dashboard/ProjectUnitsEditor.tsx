"use client";

import { useState } from "react";
import { Box, Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import type { Project, Unit } from "@/lib/types";

/**
 * PRD_3D_Project_Viewer §11/§13/§18 — a project's "Units" and "3D Model"
 * steps. Units added here immediately flow into the real unit-mapping
 * pipeline (Unit Mesh Mapper -> ThreeProjectViewer's procedural layout,
 * lib/threeBuilding.ts), unlike the model upload below: with no backend or
 * object storage in this prototype, "Add 3D model" stays an honest,
 * non-functional mock (matching the dashboard's existing Media tab) rather
 * than pretending to persist a file.
 */
export function ProjectUnitsEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const units = useAppStore(
    (s) => s.customProjects.find((p) => p.id === project.id)?.units ?? project.units
  );
  const addProjectUnit = useAppStore((s) => s.addProjectUnit);
  const removeProjectUnit = useAppStore((s) => s.removeProjectUnit);
  const priceFmt = usePriceFormat();
  const { t } = useT();

  const [code, setCode] = useState("");
  const [buildingName, setBuildingName] = useState(project.buildings[0] ?? "A");
  const [floor, setFloor] = useState(1);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [area, setArea] = useState(60);
  const [price, setPrice] = useState(80000);
  const [status, setStatus] = useState<Unit["status"]>("available");

  const canAdd = code.trim().length > 0 && area > 0 && price > 0;

  function handleAddUnit() {
    if (!canAdd) return;
    const unit: Unit = {
      id: `${project.id}-unit-${Date.now()}`,
      code: code.trim(),
      type: "residential",
      buildingName,
      floor,
      area,
      bedrooms,
      bathrooms,
      price,
      currency: "EUR",
      transaction: "sale",
      status,
      images: [],
      floorPlanImage: "",
    };
    addProjectUnit(project.id, unit);
    setCode("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-label={t("admin.projectUnitsTitle")}
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto scroll-thin bg-white shadow-[0_8px_24px_rgba(17,17,24,0.10)]">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-neutral-900">{t("admin.projectUnitsTitle")}</h2>
            <p className="truncate text-xs text-neutral-500">{project.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* 3D model — PRD §13, honestly mocked since there's no backend/
              object storage here to actually receive an upload. */}
          <section>
            <h3 className="mb-2 text-sm font-bold text-neutral-900">{t("admin.projectModelTitle")}</h3>
            <div className="rounded-panel border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
              <Box className="mx-auto h-7 w-7 text-neutral-300" />
              <p className="mt-2 text-sm font-semibold text-neutral-700">
                {t("admin.projectModelDropTitle")}
              </p>
              <p className="mt-1 text-xs text-neutral-400">{t("admin.projectModelAccepted")}</p>
              <button className="mt-3 rounded-control bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                {t("dashboard.chooseFiles")}
              </button>
              <p className="mt-2 text-[11px] text-neutral-400">{t("admin.projectModelPrototypeNote")}</p>
            </div>
          </section>

          {/* Units — PRD §18, the Unit ID <-> geometry bridge. Every unit
              added here becomes selectable in the public viewer immediately
              (lib/threeBuilding.ts groups by buildingName/floor). */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">{t("admin.projectUnitsListTitle")}</h3>
              <span className="text-xs text-neutral-500">{t("unit.unitsMatch", { matched: units.length, total: units.length })}</span>
            </div>

            {units.length === 0 ? (
              <p className="rounded-control border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
                {t("admin.projectUnitsEmpty")}
              </p>
            ) : (
              <div className="mb-3 space-y-1.5">
                {units.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-control border border-neutral-100 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-neutral-800">
                      {u.code} · {t("unit.buildingLabel", { name: u.buildingName })} ·{" "}
                      {t("unit.floorLabel", { n: u.floor })}
                    </span>
                    <span className="flex items-center gap-2 text-neutral-500">
                      {priceFmt(u.price, { compact: true })}
                      <button
                        onClick={() => removeProjectUnit(project.id, u.id)}
                        aria-label={t("common.close")}
                        className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 rounded-panel border border-neutral-200 bg-neutral-50 p-4">
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={t("admin.unitCode")}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="A-101"
                    className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                  />
                </Field>
                <Field label={t("unit.viewerBuilding")}>
                  <select
                    value={buildingName}
                    onChange={(e) => setBuildingName(e.target.value)}
                    className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                  >
                    {project.buildings.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("listing.floor")}>
                  <NumberInput value={floor} min={0} onChange={setFloor} />
                </Field>
                <Field label={t("unit.beds")}>
                  <NumberInput value={bedrooms} min={0} onChange={setBedrooms} />
                </Field>
                <Field label={t("unit.baths")}>
                  <NumberInput value={bathrooms} min={0} onChange={setBathrooms} />
                </Field>
                <Field label={t("filters.areaM2")}>
                  <NumberInput value={area} min={1} onChange={setArea} />
                </Field>
                <Field label={t("dashboard.priceLabel")}>
                  <NumberInput value={price} min={1} step={1000} onChange={setPrice} />
                </Field>
                <Field label={t("unit.viewerAvailability")}>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Unit["status"])}
                    className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                  >
                    <option value="available">{t("unit.statusAvailable")}</option>
                    <option value="reserved">{t("unit.statusReserved")}</option>
                    <option value="sold">{t("unit.statusSold")}</option>
                  </select>
                </Field>
              </div>
              <button
                onClick={handleAddUnit}
                disabled={!canAdd}
                className="flex w-full items-center justify-center gap-1.5 rounded-control bg-brand-500 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("admin.addUnit")}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
    />
  );
}
