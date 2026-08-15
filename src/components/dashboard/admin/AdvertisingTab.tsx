"use client";

import { useEffect, useState } from "react";
import { Eye, MousePointerClick } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

interface AdSlot {
  id: string | null;
  position: string;
  title?: string;
  imageUrl?: string;
  linkUrl?: string;
  enabled?: boolean;
}

const POSITION_LABEL_KEY: Record<string, string> = {
  front_page_banner_1: "admin.adsBanner1",
  front_page_banner_2: "admin.adsBanner2",
  front_page_banner_3: "admin.adsBanner3",
};

/**
 * Admin's "manage all the ads and ad positions" console (see the "Rozaris
 * Platform Audit" memory) — 3 fixed front-page banner slots, each a real
 * image + destination link, plus real impression/click analytics per
 * banner (`AnalyticsEvent`, not a fabricated number).
 */
export function AdvertisingTab() {
  const { t } = useT();
  const [slots, setSlots] = useState<AdSlot[]>([]);

  function refresh() {
    fetch("/api/admin/ads")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AdSlot[]) => setSlots(rows))
      .catch(() => {});
  }

  useEffect(refresh, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.adsTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.adsSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {slots.map((slot) => (
          <AdSlotCard key={slot.position} slot={slot} onSaved={refresh} />
        ))}
      </div>
    </div>
  );
}

function AdSlotCard({ slot, onSaved }: { slot: AdSlot; onSaved: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(slot.title ?? "");
  const [imageUrl, setImageUrl] = useState(slot.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(slot.linkUrl ?? "");
  const [enabled, setEnabled] = useState(slot.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ impression: number; click: number } | null>(null);

  useEffect(() => {
    if (!slot.id) return;
    fetch(`/api/analytics/summary?entityType=ad&entityId=${slot.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats({ impression: d.impression, click: d.click }))
      .catch(() => {});
  }, [slot.id]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: slot.position, title, imageUrl, linkUrl, enabled }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ? JSON.stringify(b.error) : "Save failed.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-neutral-900">{t(POSITION_LABEL_KEY[slot.position] ?? slot.position)}</h3>
        {stats && (
          <div className="flex items-center gap-2.5 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {stats.impression}
            </span>
            <span className="flex items-center gap-1">
              <MousePointerClick className="h-3.5 w-3.5" /> {stats.click}
            </span>
          </div>
        )}
      </div>

      {error && <p className="rounded-control bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700">{error}</p>}

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied external URL preview
        <img src={imageUrl} alt="" className="h-20 w-full rounded-control object-cover" />
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.adsLabelTitle")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.adsLabelImage")}</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.adsLabelLink")}</span>
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
        />
      </label>

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("admin.adsEnabled")}
        </label>
        <button
          disabled={busy || !title.trim() || !imageUrl.trim() || !linkUrl.trim()}
          onClick={save}
          className="rounded-control bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
