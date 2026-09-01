"use client";

import { useMemo, useState } from "react";
import { Check, Download, Plus, Search, Sheet, Trash2, X, Pencil, Layers } from "lucide-react";
import { useInventoryConnector } from "@/hooks/useInventoryConnector";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { buildInventoryWorkbook } from "@/lib/integrations/xlsx";
import { UNIT_ORIENTATIONS, type Project, type Unit, type UnitOrientation } from "@/lib/types";
import { Badge, Btn, EmptyState, ErrorNote, Panel, SectionHeader, Stat, inputClass, narrowInputClass } from "./kit";

const UNIT_TYPES: Unit["type"][] = ["residential", "commercial", "parking", "storage"];
const UNIT_STATUSES: Unit["status"][] = ["available", "reserved", "sold"];
const TRANSACTIONS: Unit["transaction"][] = ["sale", "rent", "coming_soon"];

const STATUS_TONE: Record<Unit["status"], "positive" | "warning" | "danger"> = {
  available: "positive",
  reserved: "warning",
  sold: "danger",
};

type SortKey = "code" | "buildingName" | "floor" | "area" | "price" | "pricePerM2" | "status";

type Draft = Pick<
  Unit,
  "code" | "type" | "buildingName" | "floor" | "bedrooms" | "bathrooms" | "area" | "price" | "currency" | "transaction" | "status"
> & { orientation: UnitOrientation | "" };

function toDraft(u: Unit): Draft {
  return {
    code: u.code,
    type: u.type,
    buildingName: u.buildingName,
    floor: u.floor,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    area: u.area,
    price: u.price,
    currency: u.currency,
    transaction: u.transaction,
    status: u.status,
    orientation: u.orientation ?? "",
  };
}

export function ProjectInventorySection({ project }: { project: Project }) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const { units: liveUnits, error, refresh, createUnit, updateUnit, deleteUnit } = useProjectUnits(project.id);
  const units = liveUnits ?? project.units;
  const { connector } = useInventoryConnector(project.id);

  const [query, setQuery] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const buildings = useMemo(
    () => Array.from(new Set(units.map((u) => u.buildingName))).sort(),
    [units]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = units.filter(
      (u) =>
        (!q || u.code.toLowerCase().includes(q) || u.buildingName.toLowerCase().includes(q)) &&
        (!buildingFilter || u.buildingName === buildingFilter) &&
        (!statusFilter || u.status === statusFilter)
    );
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const get = (u: Unit) => (sortKey === "pricePerM2" ? (u.area > 0 ? u.price / u.area : 0) : u[sortKey]);
      const av = get(a);
      const bv = get(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [units, query, buildingFilter, statusFilter, sortKey, sortAsc]);

  const stats = useMemo(() => {
    const total = units.length;
    const by = (s: Unit["status"]) => units.filter((u) => u.status === s).length;
    const withArea = units.filter((u) => u.area > 0);
    const avgPerM2 = withArea.length
      ? withArea.reduce((sum, u) => sum + u.price / u.area, 0) / withArea.length
      : 0;
    const availableValue = units.filter((u) => u.status === "available").reduce((s, u) => s + u.price, 0);
    return { total, available: by("available"), reserved: by("reserved"), sold: by("sold"), avgPerM2, availableValue };
  }, [units]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEdit() {
    if (!editingId || !draft) return;
    setBusy(true);
    const ok = await updateUnit(editingId, { ...draft, orientation: draft.orientation || null });
    setBusy(false);
    if (ok) {
      setEditingId(null);
      setDraft(null);
    }
  }

  async function runBulk(patch: Record<string, unknown>) {
    if (selected.size === 0) return;
    setBusy(true);
    setBulkError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/units`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitIds: [...selected], patch }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("projectManager.bulkFailed"));
      }
      refresh();
      setSelected(new Set());
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : t("projectManager.bulkFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function exportSheet() {
    const stream = buildInventoryWorkbook(
      visible.map((u) => ({
        code: u.code,
        area: u.area,
        price: u.price,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        floor: u.floor,
        status: u.status,
      })),
      project.name
    );
    const blob = await new Response(stream).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.slug}-units.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400";
  const td = "px-2.5 py-2 text-neutral-700";
  const cell = "w-full rounded-control border border-neutral-200 px-1.5 py-1 text-xs focus:border-brand-400 focus:outline-none";

  function sortableTh(key: SortKey, label: string, align: "left" | "right" = "left") {
    return (
      <th className={`${th} ${align === "right" ? "text-right" : ""}`}>
        <button
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 uppercase hover:text-neutral-700"
        >
          {label}
          {sortKey === key && <span className="text-neutral-400">{sortAsc ? "▲" : "▼"}</span>}
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("projectManager.inventoryTitle")}
        description={t("projectManager.inventoryDescription")}
        actions={
          <>
            <Btn onClick={() => void exportSheet()} disabled={visible.length === 0}>
              <Download className="h-3.5 w-3.5" />
              {t("projectManager.exportCsv")}
            </Btn>
            <Btn variant="primary" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              {t("projectManager.addUnit")}
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t("projectManager.statTotalUnits")} value={stats.total} />
        <Stat label={t("projectManager.status.available")} value={stats.available} tone="positive" />
        <Stat label={t("projectManager.status.reserved")} value={stats.reserved} tone="warning" />
        <Stat label={t("projectManager.status.sold")} value={stats.sold} tone="danger" />
        <Stat
          label={t("projectManager.statAvgPerM2")}
          value={stats.avgPerM2 > 0 ? priceFmt(Math.round(stats.avgPerM2)) : "—"}
          sub={t("projectManager.statAvailableValue", {
            value: stats.availableValue > 0 ? priceFmt(stats.availableValue, { compact: true }) : "—",
          })}
        />
      </div>

      {                                                                    
                                                               }
      {connector && (
        <p className="flex flex-wrap items-center gap-2 rounded-control border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] leading-relaxed text-brand-800">
          <Sheet className="h-3.5 w-3.5 shrink-0" />
          <span>{t("projectManager.sheetLinkedNote")}</span>
          <a
            href={`/admin/projects/${project.id}?section=sheetSync`}
            className="font-semibold underline hover:text-brand-900"
          >
            {t("projectManager.sheetLinkedOpen")}
          </a>
        </p>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {bulkError && <ErrorNote>{bulkError}</ErrorNote>}

      {adding && (
        <AddUnitForm
          project={project}
          onCancel={() => setAdding(false)}
          onCreate={async (unit) => {
            const ok = await createUnit(unit);
            if (ok) setAdding(false);
            return ok;
          }}
        />
      )}

      <Panel className="overflow-hidden">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("projectManager.searchUnits")}
              className={`${inputClass} pl-8`}
            />
          </div>
          <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)} className={narrowInputClass}>
            <option value="">{t("projectManager.allBuildings")}</option>
            {buildings.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={narrowInputClass}>
            <option value="">{t("projectManager.allStatuses")}</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`projectManager.status.${s}`)}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-400 tabular-nums">
            {t("projectManager.showingCount", { shown: visible.length, total: units.length })}
          </span>
        </div>

        {selected.size > 0 && (
          <BulkBar
            count={selected.size}
            busy={busy}
            buildings={buildings}
            onClear={() => setSelected(new Set())}
            onApply={runBulk}
          />
        )}

        {visible.length === 0 ? (
          <EmptyState>{units.length === 0 ? t("projectManager.noUnits") : t("projectManager.noUnitsMatch")}</EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto scroll-thin">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="border-y border-neutral-100 bg-neutral-50">
                <tr>
                  <th className={`${th} w-8`}>
                    <input
                      type="checkbox"
                      aria-label={t("projectManager.selectAll")}
                      checked={visible.length > 0 && visible.every((u) => selected.has(u.id))}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(visible.map((u) => u.id)) : new Set())
                      }
                    />
                  </th>
                  {sortableTh("code", t("projectManager.colCode"))}
                  {sortableTh("buildingName", t("projectManager.colBuilding"))}
                  {sortableTh("floor", t("projectManager.colFloor"), "right")}
                  <th className={th}>{t("projectManager.colType")}</th>
                  <th className={`${th} text-right`}>{t("projectManager.colBeds")}</th>
                  <th className={`${th} text-right`}>{t("projectManager.colBaths")}</th>
                  {sortableTh("area", t("projectManager.colArea"), "right")}
                  {sortableTh("price", t("projectManager.colPrice"), "right")}
                  {sortableTh("pricePerM2", t("projectManager.colPerM2"), "right")}
                  <th className={th}>{t("projectManager.colOrientation")}</th>
                  {sortableTh("status", t("projectManager.colStatus"))}
                  <th className={`${th} text-right`}>{t("projectManager.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visible.map((u) => {
                  const editing = editingId === u.id && draft;
                  return (
                    <tr key={u.id} className={selected.has(u.id) ? "bg-brand-50/40" : "hover:bg-neutral-50/60"}>
                      <td className={td}>
                        <input
                          type="checkbox"
                          aria-label={u.code}
                          checked={selected.has(u.id)}
                          onChange={() => toggleSelected(u.id)}
                        />
                      </td>
                      {editing ? (
                        <>
                          <td className={td}>
                            <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={`${cell} w-20`} />
                          </td>
                          <td className={td}>
                            <input value={draft.buildingName} onChange={(e) => setDraft({ ...draft, buildingName: e.target.value })} className={`${cell} w-20`} />
                          </td>
                          <td className={td}>
                            <input type="number" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: Number(e.target.value) })} className={`${cell} w-14 text-right`} />
                          </td>
                          <td className={td}>
                            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Unit["type"] })} className={`${cell} w-24`}>
                              {UNIT_TYPES.map((ut) => (
                                <option key={ut} value={ut}>
                                  {t(`projectManager.unitType.${ut}`)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={td}>
                            <input type="number" min={0} value={draft.bedrooms} onChange={(e) => setDraft({ ...draft, bedrooms: Number(e.target.value) })} className={`${cell} w-12 text-right`} />
                          </td>
                          <td className={td}>
                            <input type="number" min={0} value={draft.bathrooms} onChange={(e) => setDraft({ ...draft, bathrooms: Number(e.target.value) })} className={`${cell} w-12 text-right`} />
                          </td>
                          <td className={td}>
                            <input type="number" min={0} step="0.1" value={draft.area} onChange={(e) => setDraft({ ...draft, area: Number(e.target.value) })} className={`${cell} w-16 text-right`} />
                          </td>
                          <td className={td}>
                            <input type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className={`${cell} w-24 text-right`} />
                          </td>
                          <td className={`${td} text-right text-neutral-400 tabular-nums`}>
                            {draft.area > 0 ? Math.round(draft.price / draft.area).toLocaleString() : "—"}
                          </td>
                          <td className={td}>
                            <select value={draft.orientation} onChange={(e) => setDraft({ ...draft, orientation: e.target.value as UnitOrientation | "" })} className={`${cell} w-16`}>
                              <option value="">—</option>
                              {UNIT_ORIENTATIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={td}>
                            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Unit["status"] })} className={`${cell} w-24`}>
                              {UNIT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {t(`projectManager.status.${s}`)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`${td} text-right`}>
                            <div className="flex justify-end gap-0.5">
                              <button onClick={() => void saveEdit()} disabled={busy} aria-label={t("common.save")} className="rounded-control p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => { setEditingId(null); setDraft(null); }} aria-label={t("common.close")} className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`${td} font-semibold text-neutral-900`}>{u.code}</td>
                          <td className={td}>{u.buildingName}</td>
                          <td className={`${td} text-right tabular-nums`}>{u.floor}</td>
                          <td className={td}>{t(`projectManager.unitType.${u.type}`)}</td>
                          <td className={`${td} text-right tabular-nums`}>{u.bedrooms}</td>
                          <td className={`${td} text-right tabular-nums`}>{u.bathrooms}</td>
                          <td className={`${td} text-right tabular-nums`}>{u.area}</td>
                          <td className={`${td} text-right font-semibold tabular-nums text-neutral-900`}>{priceFmt(u.price)}</td>
                          <td className={`${td} text-right tabular-nums text-neutral-500`}>
                            {u.area > 0 ? Math.round(u.price / u.area).toLocaleString() : "—"}
                          </td>
                          <td className={td}>{u.orientation ?? "—"}</td>
                          <td className={td}>
                            <Badge tone={STATUS_TONE[u.status]}>{t(`projectManager.status.${u.status}`)}</Badge>
                          </td>
                          <td className={`${td} text-right`}>
                            <div className="flex justify-end gap-0.5">
                              <button
                                onClick={() => { setEditingId(u.id); setDraft(toDraft(u)); }}
                                aria-label={t("common.edit")}
                                className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(t("projectManager.confirmDeleteUnit", { code: u.code }))) void deleteUnit(u.id);
                                }}
                                aria-label={t("projectManager.deleteUnit")}
                                className="rounded-control p-1.5 text-neutral-500 hover:bg-danger/10 hover:text-danger"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BulkBar({
  count,
  busy,
  buildings,
  onClear,
  onApply,
}: {
  count: number;
  busy: boolean;
  buildings: string[];
  onClear: () => void;
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const [percent, setPercent] = useState("");

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-brand-200 bg-brand-50 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        <Layers className="h-3.5 w-3.5" />
        {t("projectManager.bulkSelected", { count })}
      </span>

      <select
        defaultValue=""
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) onApply({ status: e.target.value });
          e.target.value = "";
        }}
        className="rounded-control border border-neutral-200 bg-white px-2 py-1.5 text-xs"
      >
        <option value="">{t("projectManager.bulkSetStatus")}</option>
        {UNIT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`projectManager.status.${s}`)}
          </option>
        ))}
      </select>

      <select
        defaultValue=""
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) onApply({ transaction: e.target.value });
          e.target.value = "";
        }}
        className="rounded-control border border-neutral-200 bg-white px-2 py-1.5 text-xs"
      >
        <option value="">{t("projectManager.bulkSetTransaction")}</option>
        {TRANSACTIONS.map((tr) => (
          <option key={tr} value={tr}>
            {t(`projectManager.transaction.${tr}`)}
          </option>
        ))}
      </select>

      {buildings.length > 0 && (
        <select
          defaultValue=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onApply({ buildingName: e.target.value });
            e.target.value = "";
          }}
          className="rounded-control border border-neutral-200 bg-white px-2 py-1.5 text-xs"
        >
          <option value="">{t("projectManager.bulkMoveBuilding")}</option>
          {buildings.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number(percent);
          if (!percent.trim() || Number.isNaN(value) || value === 0) return;
          if (confirm(t("projectManager.confirmReprice", { count, percent: value }))) {
            onApply({ priceAdjustPercent: value });
            setPercent("");
          }
        }}
        className="flex items-center gap-1"
      >
        <input
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder={t("projectManager.bulkRepricePlaceholder")}
          className="w-28 rounded-control border border-neutral-200 bg-white px-2 py-1.5 text-xs"
        />
        <Btn type="submit" disabled={busy || !percent.trim()} className="py-1.5">
          {t("projectManager.bulkRepriceApply")}
        </Btn>
      </form>

      <Btn variant="ghost" onClick={onClear} className="ml-auto py-1.5">
        {t("projectManager.bulkClear")}
      </Btn>
    </div>
  );
}

function AddUnitForm({
  project,
  onCancel,
  onCreate,
}: {
  project: Project;
  onCancel: () => void;
  onCreate: (unit: Unit) => Promise<boolean>;
}) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [buildingName, setBuildingName] = useState(project.buildings[0] ?? "A");
  const [type, setType] = useState<Unit["type"]>("residential");
  const [floor, setFloor] = useState(1);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [area, setArea] = useState(60);
  const [price, setPrice] = useState(80000);
  const [status, setStatus] = useState<Unit["status"]>("available");
  const [orientation, setOrientation] = useState<UnitOrientation | "">("");
  const [busy, setBusy] = useState(false);

  const canAdd = code.trim().length > 0 && area > 0 && price > 0;

  return (
    <Panel title={t("projectManager.addUnitTitle")}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canAdd) return;
          setBusy(true);
          await onCreate({
            id: `${project.id}-unit-${Date.now()}`,
            code: code.trim(),
            type,
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
          });
          setBusy(false);
          setCode("");
        }}
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colCode")}</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A-101" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colBuilding")}</span>
          <input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colType")}</span>
          <select value={type} onChange={(e) => setType(e.target.value as Unit["type"])} className={inputClass}>
            {UNIT_TYPES.map((ut) => (
              <option key={ut} value={ut}>
                {t(`projectManager.unitType.${ut}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colFloor")}</span>
          <input type="number" value={floor} onChange={(e) => setFloor(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colOrientation")}</span>
          <select value={orientation} onChange={(e) => setOrientation(e.target.value as UnitOrientation | "")} className={inputClass}>
            <option value="">{t("projectManager.notSet")}</option>
            {UNIT_ORIENTATIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colBeds")}</span>
          <input type="number" min={0} value={bedrooms} onChange={(e) => setBedrooms(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colBaths")}</span>
          <input type="number" min={0} value={bathrooms} onChange={(e) => setBathrooms(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colArea")}</span>
          <input type="number" min={0} step="0.1" value={area} onChange={(e) => setArea(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colPrice")}</span>
          <input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">{t("projectManager.colStatus")}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Unit["status"])} className={inputClass}>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`projectManager.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-1.5 sm:col-span-3 lg:col-span-5">
          <Btn type="submit" variant="primary" disabled={!canAdd || busy}>
            <Plus className="h-3.5 w-3.5" />
            {busy ? t("common.loading") : t("projectManager.addUnit")}
          </Btn>
          <Btn type="button" onClick={onCancel}>
            {t("common.cancel")}
          </Btn>
        </div>
      </form>
    </Panel>
  );
}
