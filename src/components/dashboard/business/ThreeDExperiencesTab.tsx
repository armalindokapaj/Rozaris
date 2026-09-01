"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Box, Map as MapIcon, Flag } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface MapModelRow {
  fileName: string;
  enabled: boolean;
}
interface DetailModelRow {
  fileName: string;
  enabled: boolean;
}

export function ThreeDExperiencesTab({ projects }: { projects: Project[] }) {
  const { t } = useT();
  const [mapModels, setMapModels] = useState<Record<string, MapModelRow>>({});
  const [detailModels, setDetailModels] = useState<Record<string, DetailModelRow>>({});

  useEffect(() => {
    fetch("/api/map-models")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ({ projectId: string } & MapModelRow)[]) => {
        const byId: Record<string, MapModelRow> = {};
        rows.forEach((r) => (byId[r.projectId] = r));
        setMapModels(byId);
      })
      .catch(() => {});

    let cancelled = false;
    Promise.all(
      projects.map((p) =>
        fetch(`/api/detail-models/${p.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((row: DetailModelRow | null) => [p.id, row] as const)
          .catch(() => [p.id, null] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      const byId: Record<string, DetailModelRow> = {};
      entries.forEach(([id, row]) => {
        if (row) byId[id] = row;
      });
      setDetailModels(byId);
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.tab3DExperiences")}</h1>
        <p className="text-sm text-neutral-500">{t("threeD.subtitle")}</p>
      </div>
      {projects.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("threeD.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ThreeDProjectCard
              key={p.id}
              project={p}
              mapModel={mapModels[p.id]}
              detailModel={detailModels[p.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  live,
}: {
  icon: typeof Box;
  label: string;
  live: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", live ? "text-green-600" : "text-neutral-500")}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

function ThreeDProjectCard({
  project,
  mapModel,
  detailModel,
}: {
  project: Project;
  mapModel?: MapModelRow;
  detailModel?: DetailModelRow;
}) {
  const { t } = useT();
  const [reported, setReported] = useState(false);

  function statusLabel(row?: { fileName?: string; enabled?: boolean }) {
    if (!row?.fileName) return t("threeD.statusNotStarted");
    return row.enabled ? t("threeD.statusPublished") : t("threeD.statusInSetup");
  }

  function handleReport() {
    setReported(true);
    setTimeout(() => setReported(false), 3000);
  }

  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <p className="font-semibold text-neutral-900">{project.name}</p>
      <div className="mt-2 space-y-1">
        <StatusRow icon={Box} label={`${t("threeD.detailedExperience")}: ${statusLabel(detailModel)}`} live={!!detailModel?.enabled} />
        <StatusRow icon={MapIcon} label={`${t("threeD.mapModel")}: ${statusLabel(mapModel)}`} live={!!mapModel?.enabled} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`/project/${project.slug}`}
          target="_blank"
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          {t("threeD.preview")}
        </Link>
        <button
          onClick={handleReport}
          className="flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <Flag className="h-3.5 w-3.5" /> {t("threeD.reportIssue")}
        </button>
      </div>
      {reported && (
        <p className="mt-2 rounded-control bg-green-50 px-2.5 py-1.5 text-[11px] font-medium text-green-700">
          {t("threeD.reportSent")}
        </p>
      )}
    </div>
  );
}
