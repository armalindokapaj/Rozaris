"use client";

import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { Panel, SectionHeader, Stat } from "./kit";
import type { AdminProjectRecord } from "@/hooks/useAdminProjectRecord";
import type { ProjectSectionId } from "./sections";

/**
 * Project Manager → "Overview". The landing screen of the record: what
 * this project IS commercially (inventory mix, value, price per m²), and
 * a readiness checklist for the question that actually blocks a launch —
 * "what's still missing before this can go live".
 *
 * Every unfinished checklist row is a link to the section that fixes it,
 * rather than a message telling the admin to go and find it.
 */
export function ProjectOverviewSection({
  record,
  onNavigate,
}: {
  record: AdminProjectRecord;
  onNavigate: (section: ProjectSectionId) => void;
}) {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const { project, counts, threeD, approvalStatus } = record;
  const units = project.units;

  const available = units.filter((u) => u.status === "available");
  const sold = units.filter((u) => u.status === "sold");
  const reserved = units.filter((u) => u.status === "reserved");
  const withArea = units.filter((u) => u.area > 0);
  const avgPerM2 = withArea.length ? withArea.reduce((s, u) => s + u.price / u.area, 0) / withArea.length : 0;
  const prices = units.map((u) => u.price).filter((p) => p > 0);
  const soldThrough = units.length > 0 ? Math.round(((sold.length + reserved.length) / units.length) * 100) : 0;

  const checklist: { id: string; done: boolean; label: string; section: ProjectSectionId }[] = [
    { id: "location", done: Boolean(project.neighborhoodId), label: t("projectManager.checkLocation"), section: "location" },
    { id: "hero", done: Boolean(project.heroImage), label: t("projectManager.checkHero"), section: "media" },
    { id: "gallery", done: project.gallery.length >= 3, label: t("projectManager.checkGallery"), section: "media" },
    {
      id: "descriptions",
      done: project.description.en.trim().length > 0 && project.description.sq.trim().length > 0,
      label: t("projectManager.checkDescriptions"),
      section: "general",
    },
    { id: "units", done: units.length > 0, label: t("projectManager.checkUnits"), section: "inventory" },
    {
      id: "model",
      done: threeD.slots.some((s) => s.publishedVersion !== null),
      label: t("projectManager.checkModel"),
      section: "threeD",
    },
    { id: "published", done: approvalStatus === "active", label: t("projectManager.checkPublished"), section: "publishing" },
  ];
  const outstanding = checklist.filter((c) => !c.done);

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.overviewTitle")} description={t("projectManager.overviewDescription")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("projectManager.statInventory")}
          value={units.length}
          sub={t("projectManager.statAvailableOf", { available: available.length })}
        />
        <Stat
          label={t("projectManager.statSoldThrough")}
          value={`${soldThrough}%`}
          tone={soldThrough >= 70 ? "positive" : "neutral"}
          sub={t("projectManager.statSoldReserved", { sold: sold.length, reserved: reserved.length })}
        />
        <Stat
          label={t("projectManager.statPriceRange")}
          value={prices.length ? priceFmt(Math.min(...prices), { compact: true }) : "—"}
          sub={prices.length ? t("projectManager.statUpTo", { max: priceFmt(Math.max(...prices), { compact: true }) }) : undefined}
        />
        <Stat
          label={t("projectManager.statAvgPerM2")}
          value={avgPerM2 > 0 ? priceFmt(Math.round(avgPerM2)) : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t("projectManager.readinessTitle")}
          description={
            outstanding.length === 0
              ? t("projectManager.readinessComplete")
              : t("projectManager.readinessOutstanding", { count: outstanding.length })
          }
        >
          <ul className="space-y-1">
            {checklist.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.section)}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-neutral-300" />
                  )}
                  <span className={item.done ? "text-neutral-500 line-through decoration-neutral-300" : "text-neutral-800"}>
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("projectManager.relatedRecordsTitle")}>
          <dl className="divide-y divide-neutral-100 text-sm">
            <RelatedRow label={t("admin.tabListings")} value={counts.listings} onClick={() => onNavigate("listings")} />
            <RelatedRow label={t("projectManager.relatedLeads")} value={counts.leads} />
            <RelatedRow label={t("projectManager.relatedMembers")} value={counts.members} onClick={() => onNavigate("team")} />
            <RelatedRow
              label={t("projectManager.relatedPublishTargets")}
              value={counts.publishTargets}
              onClick={() => onNavigate("publishing")}
            />
            <RelatedRow
              label={t("projectManager.relatedModelSlots")}
              value={threeD.slots.length}
              onClick={() => onNavigate("threeD")}
            />
          </dl>
          {counts.units === 0 && (
            <p className="mt-3 flex items-center gap-1.5 rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {t("projectManager.noUnitsWarning")}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function RelatedRow({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const content = (
    <>
      <dt className="text-neutral-600">{label}</dt>
      <dd className="font-semibold tabular-nums text-neutral-900">{value}</dd>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center justify-between py-2.5 text-left hover:text-brand-600">
      {content}
    </button>
  ) : (
    <div className="flex items-center justify-between py-2.5">{content}</div>
  );
}
