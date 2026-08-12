"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag, Check, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { listings, projects } from "@/lib/mockData";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import type { ModerationCase, ModerationCaseType } from "@/lib/types";

const TYPE_LABEL_KEY: Record<ModerationCaseType, string> = {
  duplicate: "moderation.typeDuplicate",
  suspicious_price: "moderation.typeSuspiciousPrice",
  misleading_media: "moderation.typeMisleadingMedia",
  wrong_location: "moderation.typeWrongLocation",
  spam_fraud: "moderation.typeSpamFraud",
  copyright: "moderation.typeCopyright",
  user_report: "moderation.typeUserReport",
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function seedCases(): ModerationCase[] {
  const seeds: { type: ModerationCaseType; evidenceKey: string }[] = [
    { type: "suspicious_price", evidenceKey: "moderation.evidencePrice" },
    { type: "misleading_media", evidenceKey: "moderation.evidenceMedia" },
    { type: "duplicate", evidenceKey: "moderation.evidenceDuplicate" },
  ];
  const targets = [listings[2], listings[5], projects[1]].filter(Boolean);
  return targets.map((target, i) => {
    const isListing = "title" in target;
    return {
      id: `mod-${i}`,
      entityLabel: isListing ? (target as (typeof listings)[number]).title : (target as (typeof projects)[number]).name,
      entityHref: isListing
        ? `/listing/${(target as (typeof listings)[number]).slug}`
        : `/project/${(target as (typeof projects)[number]).slug}`,
      caseType: seeds[i % seeds.length].type,
      reportedAt: daysAgo(i + 1),
      status: "pending" as const,
      evidence: seeds[i % seeds.length].evidenceKey,
    };
  });
}

/** Admin's Moderation queue (PRD_ROZARIS_User_Types §5 "Verification &
 * moderation") — duplicates, suspicious pricing, misleading media, wrong
 * location, spam/fraud, copyright and user reports. Session-local seed
 * data, same convention as the Approvals Queue and Verification tabs. */
export function ModerationTab() {
  const { t, locale } = useT();
  const logAudit = useAppStore((s) => s.logAudit);
  const [cases, setCases] = useState<ModerationCase[]>(seedCases);

  function decide(id: string, status: "dismissed" | "actioned") {
    const item = cases.find((c) => c.id === id);
    setCases((c) => c.filter((i) => i.id !== id));
    if (item) logAudit(`Moderation case ${status}`, item.entityLabel);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.moderationTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.moderationSubtitle")}</p>
      </div>

      {cases.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.moderationClear")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {cases.map((item) => (
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
                    {t(TYPE_LABEL_KEY[item.caseType])} · {t(item.evidence)} · {formatRelativeDate(item.reportedAt, locale)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(item.id, "actioned")}
                  className="flex items-center gap-1.5 rounded-control bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <Check className="h-3.5 w-3.5" /> {t("admin.moderationAction")}
                </button>
                <button
                  onClick={() => decide(item.id, "dismissed")}
                  className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
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
