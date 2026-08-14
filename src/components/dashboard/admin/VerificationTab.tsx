"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
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
}

/**
 * Admin's Verification queue (PRD_ROZARIS_User_Types §5 "Verification &
 * moderation") — real unverified Publisher rows from `GET
 * /api/admin/publishers`, filtered to `!verified && !restricted`, oldest
 * signup first. Both actions are real, persisted writes against the
 * already-built `PATCH /api/admin/publishers/[id]` (server-side audit
 * logged there — no separate client-side audit call needed here):
 * "Verify" sets `verified: true`; "Restrict" sets `restricted: true` with
 * the mandatory reason the API itself enforces (PRD's ADM-005), same
 * pattern as `AccountControlsPanel`'s reason-draft input.
 *
 * Previously this whole tab synthesized a fake queue from the static
 * mockData publisher catalog — fabricated `kind`/`submittedAt` fields
 * that don't exist on a real Publisher, and "Approve"/"Reject" only ever
 * mutated session-local React state, never anything real. Now that real
 * publisher sign-ups exist, that silently did nothing to a real account.
 * There's no real per-request "kind" (business identity vs. phone vs.
 * documents, etc.) to show, since no VerificationRequest entity exists
 * yet — a publisher becomes "pending" here purely by being unverified,
 * not by submitting a specific request type. Showing a fabricated kind
 * badge would just be a smaller version of the same lie, so this shows
 * what's actually true instead: the publisher's type and how long
 * they've been waiting.
 */
export function VerificationTab() {
  const { t, locale } = useT();
  const [queue, setQueue] = useState<PendingPublisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inlined directly in the effect (not a named `load()` function called
  // from it) — same shape as useLiveProjects.ts/useLiveListings.ts, the
  // pattern that's actually clean under this project's react-hooks lint
  // config, which flags a synchronous setState reachable through a called
  // function's own first statement even though an inline call in the
  // effect body itself is fine.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/publishers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PendingPublisher[]) => {
        if (cancelled) return;
        const pending = rows
          .filter((p) => !p.verified && !p.restricted)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setQueue(pending);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
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

  const verify = (id: string) => patch(id, { verified: true });
  const restrict = (id: string) => {
    const reason = reasonDraft[id]?.trim();
    if (!reason) return;
    patch(id, { restricted: true, restrictedReason: reason });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.verificationTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.verificationSubtitle")}</p>
      </div>

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
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-500" />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{item.name}</p>
                  <p className="text-xs capitalize text-neutral-500">
                    {item.type.replace("_", " ")} · {formatRelativeDate(item.createdAt, locale)}
                  </p>
                </div>
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
                  onClick={() => verify(item.id)}
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
    </div>
  );
}
