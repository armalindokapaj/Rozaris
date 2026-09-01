"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { getListingForUnit } from "@/lib/projects";
import { cn } from "@/lib/utils";
import type { Project, Unit, UnitMeshLink } from "@/lib/types";

interface InventoryRow {
  project: Project;
  unit: Unit;
}

const STATUS_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

const STATUS_BADGE: Record<Unit["status"], string> = {
  available: "bg-green-100 text-green-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-neutral-200 text-neutral-600",
};

export function InventoryTab({ projects }: { projects: Project[] }) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const [linkedUnitIds, setLinkedUnitIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Unit["status"] | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      projects.map((p) =>
        fetch(`/api/detail-models/${p.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((row: { unitLinks?: UnitMeshLink[] } | null) => row?.unitLinks ?? [])
          .catch(() => [] as UnitMeshLink[])
      )
    ).then((results) => {
      if (cancelled) return;
      setLinkedUnitIds(new Set(results.flat().map((l) => l.unitId)));
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const rows: InventoryRow[] = useMemo(
    () =>
      projects
        .filter((project) => projectFilter === "all" || project.id === projectFilter)
        .flatMap((project) =>
          project.units
            .filter((u) => statusFilter === "all" || u.status === statusFilter)
            .map((unit) => ({ project, unit }))
        ),
    [projects, statusFilter, projectFilter]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.inventoryTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("dashboard.inventorySubtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-control border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700"
        >
          <option value="all">{t("dashboard.inventoryAllProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Unit["status"] | "all")}
          className="rounded-control border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700"
        >
          <option value="all">{t("dashboard.inventoryAllStatuses")}</option>
          <option value="available">{t("unit.statusAvailable")}</option>
          <option value="reserved">{t("unit.statusReserved")}</option>
          <option value="sold">{t("unit.statusSold")}</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-panel border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colUnit")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colProject")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colBuilding")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colFloor")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colArea")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colPrice")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colStatus")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.colListing")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.col3DMapping")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                  {t("dashboard.inventoryEmpty")}
                </td>
              </tr>
            )}
            {rows.map(({ project, unit }) => {
              const listing = getListingForUnit(project, unit);
              return (
                <tr key={`${project.id}-${unit.id}`}>
                  <td className="px-4 py-3 font-medium text-neutral-800">{unit.code}</td>
                  <td className="px-4 py-3 text-neutral-600">{project.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{unit.buildingName}</td>
                  <td className="px-4 py-3 text-neutral-600">{unit.floor}</td>
                  <td className="px-4 py-3 text-neutral-600">{unit.area} m²</td>
                  <td className="px-4 py-3 text-neutral-600">{priceFmt(unit.price)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-xs font-semibold capitalize",
                        STATUS_BADGE[unit.status]
                      )}
                    >
                      {t(STATUS_KEY[unit.status])}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {listing ? (
                      <Link
                        href={`/listing/${listing.slug}`}
                        className="text-xs font-semibold text-brand-600 hover:underline"
                      >
                        {t("dashboard.viewListing")}
                      </Link>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {linkedUnitIds.has(unit.id) ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                        {t("dashboard.mapped")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
                        {t("dashboard.unmapped")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
