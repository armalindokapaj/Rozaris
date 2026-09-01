"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MousePointerClick, Upload } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { useT } from "@/lib/i18n/useT";

interface AdSlot {
  id: string | null;
  position: string;
  title?: string;
  imageUrl?: string;
  linkUrl?: string;
  enabled?: boolean;
}

const GROUPS: { prefix: string; categoryKey: string; deviceKey: string }[] = [
  { prefix: "front_page_mobile_banner_", categoryKey: "admin.adsCategoryFrontPage", deviceKey: "admin.adsDeviceMobile" },
  { prefix: "front_page_desktop_banner_", categoryKey: "admin.adsCategoryFrontPage", deviceKey: "admin.adsDeviceDesktop" },
  { prefix: "search_page_mobile_banner_", categoryKey: "admin.adsCategorySearchPage", deviceKey: "admin.adsDeviceMobile" },
  { prefix: "search_page_desktop_banner_", categoryKey: "admin.adsCategorySearchPage", deviceKey: "admin.adsDeviceDesktop" },
];

const BANNER_LABEL_KEY: Record<string, string> = { "1": "admin.adsBanner1", "2": "admin.adsBanner2", "3": "admin.adsBanner3" };

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
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.adsTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.adsSubtitle")}</p>
      </div>

      {GROUPS.map((group) => {
        const groupSlots = slots.filter((s) => s.position.startsWith(group.prefix));
        if (groupSlots.length === 0) return null;
        return (
          <div key={group.prefix} className="space-y-3">
            <h2 className="text-sm font-bold text-neutral-800">
              {t(group.categoryKey)} <span className="text-neutral-400">·</span> {t(group.deviceKey)}
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {groupSlots.map((slot) => (
                <AdSlotCard key={slot.position} slot={slot} bannerLabelKey={BANNER_LABEL_KEY[slot.position.slice(group.prefix.length)] ?? slot.position} onSaved={refresh} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdSlotCard({ slot, bannerLabelKey, onSaved }: { slot: AdSlot; bannerLabelKey: string; onSaved: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(slot.title ?? "");
  const [imageUrl, setImageUrl] = useState(slot.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(slot.linkUrl ?? "");
  const [enabled, setEnabled] = useState(slot.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ impression: number; click: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slot.id) return;
    fetch(`/api/analytics/summary?entityType=ad&entityId=${slot.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats({ impression: d.impression, click: d.click }))
      .catch(() => {});
  }, [slot.id]);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const blob = await upload(`ads/${slot.position}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setImageUrl(blob.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.includes("authoriz") ? t("admin.sessionExpiredNote") : t("admin.adsUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

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
        <h3 className="text-sm font-bold text-neutral-900">{t(bannerLabelKey)}</h3>
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

      <div>
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.adsLabelPhoto")}</span>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded Blob URL, no next/image domain config to trust
          <img src={imageUrl} alt="" className="mb-2 h-24 w-full rounded-control object-cover" />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-neutral-300 px-2.5 py-2 text-xs font-semibold text-neutral-600 hover:border-neutral-400 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? t("admin.adsUploading") : imageUrl ? t("admin.adsReplacePhoto") : t("admin.adsUploadPhoto")}
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.adsLabelTitle")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          disabled={busy || uploading || !title.trim() || !imageUrl.trim() || !linkUrl.trim()}
          onClick={save}
          className="rounded-control bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
