"use client";

import { useEffect, useState } from "react";
import { Box, Check, Compass, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { UNIT_ORIENTATIONS, type Project, type Unit, type UnitOrientation } from "@/lib/types";

export function ProjectUnitsEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const { units: liveUnits, error: syncError, createUnit, updateUnit, deleteUnit } = useProjectUnits(project.id);
  const units = liveUnits ?? project.units;
  const priceFmt = usePriceFormat();
  const { t } = useT();

  const [linkedUnitIds, setLinkedUnitIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/admin/listings?status=all")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { projectId: string | null; unitId: string | null }[]) => {
        setLinkedUnitIds(
          new Set(rows.filter((l) => l.projectId === project.id && l.unitId).map((l) => l.unitId!))
        );
      })
      .catch(() => {});
  }, [project.id]);

  const [code, setCode] = useState("");
  const [buildingName, setBuildingName] = useState(project.buildings[0] ?? "A");
  const [floor, setFloor] = useState(1);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [area, setArea] = useState(60);
  const [price, setPrice] = useState(80000);
  const [status, setStatus] = useState<Unit["status"]>("available");
  const [orientation, setOrientation] = useState<UnitOrientation | "">("");

  const canAdd = code.trim().length > 0 && area > 0 && price > 0;

  async function handleAddUnit() {
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
      orientation: orientation || undefined,
    };
    const ok = await createUnit(unit);
    if (ok) setCode("");
  }

  type EditDraft = Pick<
    Unit,
    "code" | "buildingName" | "floor" | "bedrooms" | "bathrooms" | "area" | "price" | "status"
  > & {
    orientation: UnitOrientation | "";
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  function startEdit(u: Unit) {
    setEditingId(u.id);
    setEditDraft({
      code: u.code,
      buildingName: u.buildingName,
      floor: u.floor,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      area: u.area,
      price: u.price,
      status: u.status,
      orientation: u.orientation ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    if (!editDraft.code.trim() || editDraft.area <= 0 || editDraft.price <= 0) return;
    const patch = {
      ...editDraft,
      code: editDraft.code.trim(),
      orientation: editDraft.orientation || null,
    };
    const ok = await updateUnit(editingId, patch);
    if (ok) cancelEdit();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-label={t("admin.projectUnitsTitle")}
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto scroll-thin bg-white shadow-[var(--shadow-2)]">
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
          {                                                                
                                                                   }
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

          {                                                               
                                                                     }
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">{t("admin.projectUnitsListTitle")}</h3>
              <span className="text-xs text-neutral-500">{t("unit.unitsMatch", { matched: units.length, total: units.length })}</span>
            </div>
            {syncError && <p className="mb-2 text-xs font-medium text-red-600">{syncError}</p>}

            {units.length === 0 ? (
              <p className="rounded-control border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
                {t("admin.projectUnitsEmpty")}
              </p>
            ) : (
              <div className="mb-3 space-y-1.5">
                {units.map((u) =>
                  editingId === u.id && editDraft ? (
                    <div
                      key={u.id}
                      className="space-y-2.5 rounded-control border border-brand-300 bg-brand-50/40 p-3"
                    >
                      <div className="grid grid-cols-2 gap-2.5">
                        <Field label={t("admin.unitCode")}>
                          <input
                            value={editDraft.code}
                            onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })}
                            className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                          />
                        </Field>
                        <Field label={t("unit.viewerBuilding")}>
                          <select
                            value={editDraft.buildingName}
                            onChange={(e) => setEditDraft({ ...editDraft, buildingName: e.target.value })}
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
                          <NumberInput
                            value={editDraft.floor}
                            min={0}
                            onChange={(v) => setEditDraft({ ...editDraft, floor: v })}
                          />
                        </Field>
                        <Field label={t("unit.beds")}>
                          <NumberInput
                            value={editDraft.bedrooms}
                            min={0}
                            onChange={(v) => setEditDraft({ ...editDraft, bedrooms: v })}
                          />
                        </Field>
                        <Field label={t("unit.baths")}>
                          <NumberInput
                            value={editDraft.bathrooms}
                            min={0}
                            onChange={(v) => setEditDraft({ ...editDraft, bathrooms: v })}
                          />
                        </Field>
                        <Field label={t("filters.areaM2")}>
                          <NumberInput
                            value={editDraft.area}
                            min={1}
                            onChange={(v) => setEditDraft({ ...editDraft, area: v })}
                          />
                        </Field>
                        <Field label={t("dashboard.priceLabel")}>
                          <NumberInput
                            value={editDraft.price}
                            min={1}
                            step={1000}
                            onChange={(v) => setEditDraft({ ...editDraft, price: v })}
                          />
                        </Field>
                        <Field label={t("unit.viewerAvailability")}>
                          <select
                            value={editDraft.status}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, status: e.target.value as Unit["status"] })
                            }
                            className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                          >
                            <option value="available">{t("unit.statusAvailable")}</option>
                            <option value="reserved">{t("unit.statusReserved")}</option>
                            <option value="sold">{t("unit.statusSold")}</option>
                          </select>
                        </Field>
                        <Field label={t("unit.orientation")}>
                          <OrientationSelect
                            value={editDraft.orientation}
                            onChange={(v) => setEditDraft({ ...editDraft, orientation: v })}
                          />
                        </Field>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={!editDraft.code.trim() || editDraft.area <= 0 || editDraft.price <= 0}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-brand-500 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {t("common.save")}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex items-center justify-center gap-1.5 rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={u.id}
                      className="flex items-center justify-between gap-2 rounded-control border border-neutral-100 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate font-semibold text-neutral-800">
                        {u.code} · {t("unit.buildingLabel", { name: u.buildingName })} ·{" "}
                        {t("unit.floorLabel", { n: u.floor })} ·{" "}
                        <span className="font-normal text-neutral-500">
                          {t(`unit.status${u.status[0].toUpperCase()}${u.status.slice(1)}`)}
                        </span>
                        {u.orientation && (
                          <span
                            title={t(`unit.orientation${u.orientation}`)}
                            className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600"
                          >
                            <Compass className="h-2.5 w-2.5" /> {u.orientation}
                          </span>
                        )}
                        {linkedUnitIds.has(u.id) && (
                          <span
                            title={t("admin.hasLinkedListing")}
                            className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600"
                          >
                            <Link2 className="h-2.5 w-2.5" /> {t("admin.hasLinkedListing")}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-neutral-500">
                        {priceFmt(u.price, { compact: true })}
                        <button
                          onClick={() => startEdit(u)}
                          aria-label={t("common.edit")}
                          className="rounded-full p-1 text-neutral-400 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void deleteUnit(u.id)}
                          aria-label={t("common.close")}
                          className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  )
                )}
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
                <Field label={t("unit.orientation")}>
                  <OrientationSelect value={orientation} onChange={setOrientation} />
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

function OrientationSelect({
  value,
  onChange,
}: {
  value: UnitOrientation | "";
  onChange: (v: UnitOrientation | "") => void;
}) {
  const { t } = useT();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as UnitOrientation | "")}
      className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
    >
      <option value="">{t("unit.orientationUnset")}</option>
      {UNIT_ORIENTATIONS.map((o) => (
        <option key={o} value={o}>
          {t(`unit.orientation${o}`)}
        </option>
      ))}
    </select>
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
