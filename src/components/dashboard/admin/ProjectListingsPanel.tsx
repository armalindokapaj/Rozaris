"use client";

import { Fragment, useEffect, useState } from "react";
import { Plus, Gem } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { NewListingForm } from "@/components/dashboard/NewListingForm";
import { isListingIdle, isListingStale } from "@/lib/moderation";
import { ListingManagePanel, LISTING_STATUS_STYLE, type AdminListingRow } from "@/components/dashboard/admin/ListingManagePanel";
import type { Project } from "@/lib/types";

interface PublisherOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface UnitOption {
  id: string;
  code: string;
}

export function ProjectListingsPanel({ project, publishers }: { project: Project; publishers: PublisherOption[] }) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

  function refresh() {
    fetch("/api/admin/listings?status=all")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AdminListingRow[]) => setListings(rows.filter((l) => l.projectId === project.id)))
      .catch(() => {});
  }

  useEffect(refresh, [project.id]);
  useEffect(() => {
    fetch("/api/admin/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectOption[]) => setProjects(rows))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch(`/api/projects/${project.id}/units`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: UnitOption[]) => setUnits(rows))
      .catch(() => {});
  }, [project.id]);

  return (
    <div className="space-y-3 border-t border-neutral-200 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-neutral-900">{t("admin.listingsMgmtTitle")}</h3>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> {t("admin.newListing")}
        </button>
      </div>

      {creating && (
        <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-3">
          <NewListingForm
            publisherId={project.developer.id}
            projectId={project.id}
            projectName={project.name}
            unitOptions={units}
            onSaved={() => {
              setCreating(false);
              refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("dashboard.titleLabel")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.linkedUnitLabel")}</th>
              <th className="px-3 py-2 font-medium">{t("dashboard.priceLabel")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.colStatus")}</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {listings.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td className="px-3 py-2.5 font-medium text-neutral-800">{l.title}</td>
                  <td className="px-3 py-2.5 text-neutral-600">
                    {l.unitCode ?? <span className="text-neutral-400">{t("admin.unassignedOption")}</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-neutral-600">{priceFmt(l.price)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${LISTING_STATUS_STYLE[l.status]}`}>
                      {l.status}
                    </span>
                    {isListingIdle(l) && (
                      <span className="ml-1.5 rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                        {t("admin.idleBadge")}
                      </span>
                    )}
                    {isListingStale(l) && (
                      <span className="ml-1.5 rounded-full bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                        {t("admin.staleBadge")}
                      </span>
                    )}
                    {l.premium && (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                        <Gem className="h-3 w-3" /> {t("admin.premiumBadge")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setManaging(managing === l.id ? null : l.id)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {managing === l.id ? t("common.close") : t("admin.manage")}
                    </button>
                  </td>
                </tr>
                {managing === l.id && (
                  <tr>
                    <td colSpan={5} className="bg-neutral-50 px-3 py-3">
                      <ListingManagePanel listing={l} publishers={publishers} projects={projects} onDone={refresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {listings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-neutral-400">
                  {t("admin.noListingsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
