"use client";

import { useEffect, useState } from "react";
import { Check, X, ShieldCheck, IdCard } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";

interface PendingPublisher {
  id: string;
  slug: string;
  name: string;
  type: string;
  verified: boolean;
  restricted: boolean;
  createdAt: string;
  verificationStatus: string;
  verificationSubmittedAt: string | null;
}

interface PendingIdentity {
  id: string;
  name: string;
  email: string | null;
  identitySubmittedAt: string | null;
  identityNote: string | null;
}

/**
 * Admin's Verification queue (Account & Profile System PRD v1.0 §9
 * "Verification & Trust") — two real, independent queues now that
 * `Publisher.verificationStatus` and `User.identityVerificationStatus`
 * exist:
 *
 * 1. Business verification: real `verificationStatus === "pending"` rows —
 *    an org only appears here after its owner/admin actually clicked
 *    "Request verification" (`POST /api/business/verification-request`),
 *    not just by being unverified. Previously this showed EVERY
 *    `!verified` publisher regardless of whether anyone asked to be
 *    reviewed — this pass's whole point was replacing that with a real
 *    submitted state (see this component's prior doc comment, now
 *    superseded).
 * 2. Identity verification: real `identityVerificationStatus === "pending"`
 *    accounts, from `GET /api/admin/identity-verifications` — unlocks the
 *    "Verified Publisher" badge for a Private Publisher.
 *
 * "Restrict publishing" stays on the same real, audit-logged
 * `PATCH /api/admin/publishers/[id]` it always was — unrelated to either
 * verification queue, still shown per business-queue row for convenience.
 */
export function VerificationTab() {
  const { t, locale } = useT();
  const [queue, setQueue] = useState<PendingPublisher[]>([]);
  const [identityQueue, setIdentityQueue] = useState<PendingIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/publishers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PendingPublisher[]) => {
        const pending = rows
          .filter((p) => p.verificationStatus === "pending")
          .sort(
            (a, b) =>
              new Date(a.verificationSubmittedAt ?? a.createdAt).getTime() -
              new Date(b.verificationSubmittedAt ?? b.createdAt).getTime()
          );
        setQueue(pending);
      })
      .finally(() => setLoading(false));
    fetch("/api/admin/identity-verifications")
      .then((r) => (r.ok ? r.json() : []))
      .then(setIdentityQueue)
      .catch(() => {});
  }

  useEffect(load, []);

  async function patchPublisher(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/publishers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) setQueue((q) => q.filter((p) => p.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  const verifyBusiness = (id: string) => patchPublisher(id, { verificationStatus: "verified" });
  const rejectBusiness = (id: string) => {
    const reason = reasonDraft[id]?.trim();
    if (!reason) return;
    patchPublisher(id, { verificationStatus: "rejected", verificationRejectionReason: reason });
  };
  const restrict = (id: string) => {
    const reason = reasonDraft[id]?.trim();
    if (!reason) return;
    patchPublisher(id, { restricted: true, restrictedReason: reason });
  };

  async function decideIdentity(userId: string, decision: "verified" | "failed") {
    const reason = reasonDraft[userId]?.trim();
    if (decision === "failed" && !reason) return;
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/identity-verifications/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      if (res.ok) setIdentityQueue((q) => q.filter((u) => u.id !== userId));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.verificationTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.verificationSubtitle")}</p>
      </div>

      <section className="space-y-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
          <ShieldCheck className="h-4 w-4 text-brand-500" /> {t("admin.verificationBusinessQueue")}
        </h2>
        {!loading && queue.length === 0 ? (
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
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{item.name}</p>
                  <p className="text-xs capitalize text-neutral-500">
                    {item.type.replace("_", " ")} ·{" "}
                    {formatRelativeDate(item.verificationSubmittedAt ?? item.createdAt, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={reasonDraft[item.id] ?? ""}
                    onChange={(e) => setReasonDraft((s) => ({ ...s, [item.id]: e.target.value }))}
                    placeholder={t("admin.superAdmin.reasonPlaceholder")}
                    className="w-44 rounded-control border border-neutral-200 px-2 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                  />
                  <button
                    onClick={() => restrict(item.id)}
                    disabled={busyId === item.id || !reasonDraft[item.id]?.trim()}
                    className="flex items-center gap-1.5 rounded-control border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("admin.superAdmin.restrict")}
                  </button>
                  <button
                    onClick={() => rejectBusiness(item.id)}
                    disabled={busyId === item.id || !reasonDraft[item.id]?.trim()}
                    className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                  </button>
                  <button
                    onClick={() => verifyBusiness(item.id)}
                    disabled={busyId === item.id}
                    className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
          <IdCard className="h-4 w-4 text-brand-500" /> {t("admin.verificationIdentityQueue")}
        </h2>
        {identityQueue.length === 0 ? (
          <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
            {t("admin.verificationClear")}
          </p>
        ) : (
          <div className="space-y-2.5">
            {identityQueue.map((item) => (
              <div key={item.id} className="rounded-panel border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {item.name} <span className="font-normal text-neutral-400">({item.email})</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {item.identitySubmittedAt ? formatRelativeDate(item.identitySubmittedAt, locale) : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={reasonDraft[item.id] ?? ""}
                      onChange={(e) => setReasonDraft((s) => ({ ...s, [item.id]: e.target.value }))}
                      placeholder={t("admin.superAdmin.reasonPlaceholder")}
                      className="w-44 rounded-control border border-neutral-200 px-2 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                    />
                    <button
                      onClick={() => decideIdentity(item.id, "failed")}
                      disabled={busyId === item.id || !reasonDraft[item.id]?.trim()}
                      className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" /> {t("admin.reject")}
                    </button>
                    <button
                      onClick={() => decideIdentity(item.id, "verified")}
                      disabled={busyId === item.id}
                      className="flex items-center gap-1.5 rounded-control bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("admin.approve")}
                    </button>
                  </div>
                </div>
                {item.identityNote && (
                  <p className="mt-2 rounded-control bg-neutral-50 p-2.5 text-xs text-neutral-600">
                    {item.identityNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
