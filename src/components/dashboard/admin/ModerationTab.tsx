"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flag, Check, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import type { ModerationCaseType } from "@/lib/types";

const TYPE_LABEL_KEY: Record<ModerationCaseType, string> = {
  duplicate: "moderation.typeDuplicate",
  suspicious_price: "moderation.typeSuspiciousPrice",
  misleading_media: "moderation.typeMisleadingMedia",
  wrong_location: "moderation.typeWrongLocation",
  spam_fraud: "moderation.typeSpamFraud",
  copyright: "moderation.typeCopyright",
  user_report: "moderation.typeUserReport",
};

interface ReportRow {
  id: string;
  entityType: "listing" | "project";
  entityId: string;
  caseType: ModerationCaseType;
  note: string | null;
  status: "pending" | "actioned" | "dismissed";
  createdAt: string;
  entityLabel: string;
  entityHref: string | null;
}

export function ModerationTab() {
  const { t } = useT();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/moderation?status=pending")
      .then((r) => (r.ok ? r.json() : []))
      .then(setReports)
      .catch(() => {});
  }

  useEffect(load, []);

  async function decide(id: string, status: "actioned" | "dismissed") {
    setBusyId(id);
    await fetch(`/api/admin/moderation/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setReports((r) => r.filter((c) => c.id !== id));
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.moderationTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.moderationSubtitle")}</p>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.moderationClear")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {reports.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <Flag className="h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  {item.entityHref ? (
                    <Link href={item.entityHref} target="_blank" className="text-sm font-semibold text-neutral-900 hover:text-brand-600">
                      {item.entityLabel}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-neutral-900">{item.entityLabel}</p>
                  )}
                  <p className="text-xs text-neutral-500">
                    {t(TYPE_LABEL_KEY[item.caseType])}
                    {item.note ? ` · “${item.note}”` : ""} · {formatRelativeDate(item.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busyId === item.id}
                  onClick={() => decide(item.id, "actioned")}
                  className="flex items-center gap-1.5 rounded-control bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" /> {t("admin.moderationAction")}
                </button>
                <button
                  disabled={busyId === item.id}
                  onClick={() => decide(item.id, "dismissed")}
                  className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" /> {t("admin.moderationDismiss")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
