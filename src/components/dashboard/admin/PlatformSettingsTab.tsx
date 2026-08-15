"use client";

import { useEffect, useState } from "react";
import { Lock, Flag, IdCard, SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import type { SearchRankingWeights } from "@/lib/searchRanking";

interface FieldPolicyRow {
  key: string;
  scope: string;
  label: string;
  required: boolean;
  isOverridden: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const SCOPE_LABEL_KEY: Record<string, string> = {
  standard_user: "admin.fieldPolicies.scopeStandardUser",
  private_publisher: "admin.fieldPolicies.scopePrivatePublisher",
  business_publisher: "admin.fieldPolicies.scopeBusinessPublisher",
};

/** Account & Profile System PRD v1.0 — "Admin can edit everything from
 * the console panel; can make some fillings from users 'Must fill this'
 * or 'Only by choice'." Real DB-backed per-field required/optional
 * override (`FieldPolicy`, see src/lib/fieldPolicies.ts for the registry
 * every key here comes from), enforced server-side by
 * `/api/account/profile`'s PATCH — this toggle isn't just cosmetic. */
function FieldPoliciesSection() {
  const { t } = useT();
  const [rows, setRows] = useState<FieldPolicyRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/field-policies")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }

  useEffect(load, []);

  async function toggle(key: string, next: boolean) {
    setBusyKey(key);
    const res = await fetch("/api/admin/field-policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, required: next }),
    });
    if (res.ok) load();
    setBusyKey(null);
  }

  const scopes = [...new Set(rows.map((r) => r.scope))];

  return (
    <div className="space-y-2 rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <IdCard className="h-4 w-4 text-brand-500" />
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.fieldPolicies.title")}</h2>
      </div>
      <p className="-mt-1 text-xs text-neutral-500">{t("admin.fieldPolicies.subtitle")}</p>
      {scopes.map((scope) => (
        <div key={scope} className="pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {t(SCOPE_LABEL_KEY[scope] ?? "admin.fieldPolicies.scopeStandardUser")}
          </p>
          <div className="mt-1 divide-y divide-neutral-100">
            {rows
              .filter((r) => r.scope === scope)
              .map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{f.label}</p>
                    <p className="text-[11px] text-neutral-400">
                      {f.isOverridden && f.updatedBy && f.updatedAt
                        ? `${t("admin.lastUpdated", { date: new Date(f.updatedAt).toLocaleString() })} · ${f.updatedBy}`
                        : t("admin.fieldPolicies.usingDefault")}
                    </p>
                  </div>
                  <div className="flex shrink-0 rounded-control bg-neutral-100 p-1">
                    <button
                      disabled={busyKey === f.key}
                      onClick={() => toggle(f.key, false)}
                      className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                        !f.required ? "bg-white text-neutral-900 shadow-[var(--shadow-1)]" : "text-neutral-500"
                      }`}
                    >
                      {t("admin.fieldPolicies.onlyByChoice")}
                    </button>
                    <button
                      disabled={busyKey === f.key}
                      onClick={() => toggle(f.key, true)}
                      className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                        f.required ? "bg-brand-500 text-white shadow-[var(--shadow-1)]" : "text-neutral-500"
                      }`}
                    >
                      {t("admin.fieldPolicies.mustFill")}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="py-2 text-xs text-neutral-400">{t("common.loading")}</p>}
    </div>
  );
}

interface FeatureFlagRow {
  key: string;
  description: string;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

function FeatureFlagsSection() {
  const { t } = useT();
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/feature-flags")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFlags)
      .catch(() => {});
  }

  useEffect(load, []);

  async function toggle(key: string, next: boolean) {
    setBusyKey(key);
    const res = await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled: next }),
    });
    if (res.ok) load();
    setBusyKey(null);
  }

  return (
    <div className="space-y-2 rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-brand-500" />
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.featureFlagsTitle")}</h2>
      </div>
      <p className="-mt-1 text-xs text-neutral-500">{t("admin.featureFlagsSubtitle")}</p>
      <div className="mt-2 divide-y divide-neutral-100">
        {flags.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-neutral-800">{f.description}</p>
              <p className="text-[11px] text-neutral-400">
                {f.key}
                {f.updatedBy && f.updatedAt
                  ? ` · ${t("admin.lastUpdated", { date: new Date(f.updatedAt).toLocaleString() })} · ${f.updatedBy}`
                  : ""}
              </p>
            </div>
            <button
              disabled={busyKey === f.key}
              onClick={() => toggle(f.key, !f.enabled)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                f.enabled ? "bg-green-600 text-white hover:bg-green-700" : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
              }`}
            >
              {f.enabled ? t("admin.flagOn") : t("admin.flagOff")}
            </button>
          </div>
        ))}
        {flags.length === 0 && <p className="py-2 text-xs text-neutral-400">{t("common.loading")}</p>}
      </div>
    </div>
  );
}

interface PageSeoRow {
  page: string;
  fallbackTitle: string;
  fallbackDescription: string;
  title: string;
  description: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Platform CMS's "SEO titles / SEO descriptions" — real per-page
 * overrides (`PageSeoOverride`), read by each page's own
 * `generateMetadata()` (see src/lib/pageSeo.ts). Leaving both fields
 * blank and saving clears the override back to that page's own real
 * hardcoded copy, shown as the placeholder text. */
function PageSeoSection() {
  const { t } = useT();
  const [rows, setRows] = useState<PageSeoRow[]>([]);
  const [openPage, setOpenPage] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/page-seo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }

  useEffect(load, []);

  return (
    <div className="space-y-2 rounded-panel border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-bold text-neutral-900">{t("admin.pageSeoTitle")}</h2>
      <p className="-mt-1 text-xs text-neutral-500">{t("admin.pageSeoSubtitle")}</p>
      <div className="mt-2 divide-y divide-neutral-100">
        {rows.map((r) => (
          <div key={r.page} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-800">{r.title || r.fallbackTitle}</p>
                <p className="text-[11px] text-neutral-400">
                  {r.page}
                  {r.updatedBy && r.updatedAt
                    ? ` · ${t("admin.lastUpdated", { date: new Date(r.updatedAt).toLocaleString() })} · ${r.updatedBy}`
                    : ` · ${t("admin.fieldPolicies.usingDefault")}`}
                </p>
              </div>
              <button
                onClick={() => setOpenPage(openPage === r.page ? null : r.page)}
                className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
              >
                {openPage === r.page ? t("common.close") : t("admin.manage")}
              </button>
            </div>
            {openPage === r.page && <PageSeoEditor row={r} onSaved={load} />}
          </div>
        ))}
        {rows.length === 0 && <p className="py-2 text-xs text-neutral-400">{t("common.loading")}</p>}
      </div>
    </div>
  );
}

function PageSeoEditor({ row, onSaved }: { row: PageSeoRow; onSaved: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/admin/page-seo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: row.page, title, description }),
    });
    if (res.ok) onSaved();
    setBusy(false);
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-control bg-neutral-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.pageSeoTitleLabel")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={row.fallbackTitle}
          className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.pageSeoDescriptionLabel")}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={row.fallbackDescription}
          rows={2}
          className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        disabled={busy}
        onClick={save}
        className="rounded-control bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {t("common.save")}
      </button>
    </div>
  );
}

const WEIGHT_LABEL_KEY: Record<keyof SearchRankingWeights, string> = {
  premiumWeight: "admin.searchRanking.premium",
  freshListingWeight: "admin.searchRanking.fresh",
  verifiedPublisherWeight: "admin.searchRanking.verified",
  completeInfoWeight: "admin.searchRanking.complete",
  threeDProjectWeight: "admin.searchRanking.threeD",
  poorDataWeight: "admin.searchRanking.poorData",
};

/** Search Engine Control's real ranking weights (`SearchRankingConfig`) —
 * applied by `src/lib/searchRanking.ts`'s `computeRankScore()` to real
 * listing fields wherever the public "recommended" sort is used
 * (`getVisibleListings`, src/lib/filtering.ts). */
function SearchRankingSection() {
  const { t } = useT();
  const [weights, setWeights] = useState<SearchRankingWeights | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/search-ranking")
      .then((r) => (r.ok ? r.json() : null))
      .then(setWeights)
      .catch(() => {});
  }, []);

  async function save() {
    if (!weights) return;
    const res = await fetch("/api/admin/search-ranking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weights),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  return (
    <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-brand-500" />
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.searchRanking.title")}</h2>
      </div>
      <p className="-mt-1 text-xs text-neutral-500">{t("admin.searchRanking.subtitle")}</p>
      {!weights ? (
        <p className="py-2 text-xs text-neutral-400">{t("common.loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.keys(WEIGHT_LABEL_KEY) as (keyof SearchRankingWeights)[]).map((key) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">{t(WEIGHT_LABEL_KEY[key])}</span>
                <input
                  type="number"
                  min={-100}
                  max={100}
                  value={weights[key]}
                  onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                  className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
          <button
            onClick={save}
            className="rounded-control bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white"
          >
            {t("common.save")}
          </button>
          {saved && (
            <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">{t("admin.rateSaved")}</p>
          )}
        </>
      )}
    </div>
  );
}

const STUB_SECTION_KEYS = [
  "publishing",
  "verification",
  "threeD",
  "map",
  "promotions",
  "notifications",
  "security",
] as const;

/** Admin's Platform Settings tab (PRD_ROZARIS_User_Types §5 "Platform
 * configuration") — absorbs the existing EUR→ALL exchange-rate editor
 * (the one setting that's genuinely wired end-to-end today) as its first
 * real section, with the PRD's other settings groups shown as honest
 * placeholders rather than faked controls with nothing behind them. */
export function PlatformSettingsTab() {
  const { t } = useT();
  const rate = useAppStore((s) => s.eurToAllRate);
  const updatedAt = useAppStore((s) => s.eurToAllRateUpdatedAt);
  const setEurToAllRate = useAppStore((s) => s.setEurToAllRate);
  const [input, setInput] = useState(String(rate));
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const parsed = Math.round(Number(input));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setEurToAllRate(parsed, new Date().toISOString());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.platformSettingsTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.platformSettingsSubtitle")}</p>
      </div>

      <div className="max-w-sm space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.currencyTitle")}</h2>
        <p className="-mt-2 text-xs text-neutral-500">{t("admin.currencySubtitle")}</p>
        <div>
          <p className="text-xs font-medium text-neutral-500">{t("admin.currentRateLabel")}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{t("admin.currentRateValue", { rate })}</p>
          <p className="mt-1 text-xs text-neutral-400">
            {updatedAt ? t("admin.lastUpdated", { date: new Date(updatedAt).toLocaleString() }) : t("admin.neverUpdated")}
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.newRateLabel")}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <button
          onClick={handleSave}
          className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t("admin.saveRate")}
        </button>
        {saved && (
          <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">{t("admin.rateSaved")}</p>
        )}
      </div>

      <FeatureFlagsSection />

      <FieldPoliciesSection />

      <PageSeoSection />

      <SearchRankingSection />

      <div>
        <h2 className="mb-2 text-sm font-bold text-neutral-900">{t("admin.otherSettingsTitle")}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STUB_SECTION_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center gap-2.5 rounded-card border border-dashed border-neutral-200 bg-white p-3 text-neutral-400"
            >
              <Lock className="h-4 w-4 shrink-0" />
              <span className="text-sm">{t(`admin.settingsGroup.${key}`)}</span>
              <span className="ml-auto text-[11px] font-medium">{t("admin.notYetWired")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
