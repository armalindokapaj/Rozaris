"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X, Home, Building2, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import type { ApprovalItem, ApprovalItemType } from "@/app/api/admin/approval-center/route";

const TYPE_ICON: Record<ApprovalItemType, typeof Home> = {
  listing: Home,
  project: Building2,
  publisher_verification: ShieldCheck,
};

const TYPE_LABEL_KEY: Record<ApprovalItemType, string> = {
  listing: "admin.approvalTypeListing",
  project: "admin.approvalTypeProject",
  publisher_verification: "admin.approvalTypeVerification",
};

export function ApprovalCenterTab() {
  const { t } = useT();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/approval-center")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ApprovalItem[]) => setItems(rows))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function decide(item: ApprovalItem, verdict: "approve" | "reject") {
    setBusyId(item.id);
    setError(null);
    try {
      let res: Response;
      if (item.type === "listing") {
        res = await fetch(`/api/admin/listings/${item.id}/publication`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            verdict === "approve"
              ? { status: "active" }
              : { status: "rejected", reason: "Rejected from Approval Center" }
          ),
        });
      } else if (item.type === "project") {
        res = await fetch(`/api/admin/projects/${item.id}/publication`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            verdict === "approve"
              ? { approvalStatus: "active" }
              : { approvalStatus: "archived", reason: "Rejected from Approval Center" }
          ),
        });
      } else {
        res = await fetch(`/api/admin/publishers/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            verdict === "approve"
              ? { verified: true }
              : { restricted: true, restrictedReason: "Verification rejected from Approval Center" }
          ),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ? JSON.stringify(body.error) : "Action failed.");
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id || i.type !== item.type));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.queueTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.queueSubtitle")}</p>
      </div>

      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      {loading ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.queueClear")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <div
                key={`${item.type}-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-neutral-200 bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                  <div>
                    <Link href={item.href} className="text-sm font-semibold text-neutral-900 hover:text-brand-600">
                      {item.title}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {t(TYPE_LABEL_KEY[item.type])} · {t("admin.submittedBy", { name: item.submittedBy })} ·{" "}
                      {formatRelativeDate(item.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busyId === item.id}
                    onClick={() => decide(item, "approve")}
                    className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                  </button>
                  <button
                    disabled={busyId === item.id}
                    onClick={() => decide(item, "reject")}
                    className="flex items-center gap-1.5 rounded-control border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
