"use client";

import { useState } from "react";
import { Check, X, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { publishers } from "@/lib/mockData";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import type { VerificationKind, VerificationRequest } from "@/lib/types";

const KIND_LABEL_KEY: Record<VerificationKind, string> = {
  business_identity: "verification.kindBusinessIdentity",
  developer_identity: "verification.kindDeveloperIdentity",
  phone: "verification.kindPhone",
  company_documents: "verification.kindCompanyDocuments",
  project_authorization: "verification.kindProjectAuthorization",
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function seedQueue(): VerificationRequest[] {
  const kinds: VerificationKind[] = ["business_identity", "developer_identity", "company_documents"];
  return publishers
    .filter((p) => !p.verified)
    .slice(0, 6)
    .map((p, i) => ({
      id: `vf-${p.id}`,
      publisherId: p.id,
      publisherName: p.name,
      kind: kinds[i % kinds.length],
      submittedAt: daysAgo(i + 1),
      status: "pending" as const,
    }));
}

/** Admin's Verification queue (PRD_ROZARIS_User_Types §5 "Verification &
 * moderation") — business/developer identity, phone and document review.
 * Reuses Publisher.verified (mockData) as the underlying signal; decisions
 * here are session-local (the seeded publishers array can't be mutated),
 * mirroring the existing Approvals Queue tab's local-state pattern. */
export function VerificationTab() {
  const { t, locale } = useT();
  const logAudit = useAppStore((s) => s.logAudit);
  const [queue, setQueue] = useState<VerificationRequest[]>(seedQueue);

  function decide(id: string, status: "approved" | "rejected") {
    const item = queue.find((q) => q.id === id);
    setQueue((q) => q.filter((i) => i.id !== id));
    if (item) logAudit(`Verification ${status}`, item.publisherName);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.verificationTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.verificationSubtitle")}</p>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.verificationClear")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-500" />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{item.publisherName}</p>
                  <p className="text-xs text-neutral-500">
                    {t(KIND_LABEL_KEY[item.kind])} · {formatRelativeDate(item.submittedAt, locale)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(item.id, "approved")}
                  className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                >
                  <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                </button>
                <button
                  onClick={() => decide(item.id, "rejected")}
                  className="flex items-center gap-1.5 rounded-control border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
