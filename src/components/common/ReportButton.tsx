"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import type { ModerationCaseType } from "@/lib/types";

const REASON_KEYS: Record<ModerationCaseType, string> = {
  duplicate: "moderation.typeDuplicate",
  suspicious_price: "moderation.typeSuspiciousPrice",
  misleading_media: "moderation.typeMisleadingMedia",
  wrong_location: "moderation.typeWrongLocation",
  spam_fraud: "moderation.typeSpamFraud",
  copyright: "moderation.typeCopyright",
  user_report: "moderation.typeUserReport",
};
const REASONS = Object.keys(REASON_KEYS) as ModerationCaseType[];

/**
 * Real "Report" action on a listing/project detail page — the entry point
 * to the Moderation queue admin now actually reviews (`ModerationReport`,
 * see schema.prisma). Requires sign-in (same gate as Save on this page);
 * a signed-out visitor is prompted to sign in rather than the button
 * silently doing nothing.
 */
export function ReportButton({
  entityType,
  entityId,
  className,
}: {
  entityType: "listing" | "project";
  entityId: string;
  className?: string;
}) {
  const { t } = useT();
  const auth = useAppStore((s) => s.auth);
  const openSignIn = useAppStore((s) => s.openSignIn);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ModerationCaseType | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function handleClick() {
    if (!auth.signedIn) {
      openSignIn();
      return;
    }
    setOpen((v) => !v);
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, caseType: reason, note: note.trim() || undefined }),
      });
      if (res.ok) {
        setDone(true);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className={`text-xs font-medium text-neutral-500 ${className ?? ""}`}>{t("moderation.reportThanks")}</p>;
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-600"
      >
        <Flag className="h-3.5 w-3.5" />
        {t("moderation.reportAction")}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-64 space-y-2.5 rounded-panel border border-neutral-200 bg-white p-3.5 shadow-[var(--shadow-2)]">
          <p className="text-xs font-semibold text-neutral-700">{t("moderation.reportPrompt")}</p>
          <div className="space-y-1">
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-xs text-neutral-600">
                <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
                {t(REASON_KEYS[r])}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("moderation.reportNotePlaceholder")}
            rows={2}
            className="w-full rounded-control border border-neutral-200 px-2 py-1.5 text-xs"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="text-xs font-medium text-neutral-500">
              {t("common.close")}
            </button>
            <button
              disabled={!reason || busy}
              onClick={submit}
              className="rounded-control bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {t("moderation.reportSubmit")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
