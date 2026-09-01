"use client";

import { Fragment, useState } from "react";
import { Search, KeyRound, Ban, CheckCircle2, ShieldCheck, ShieldOff, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { isPublisherIdle } from "@/lib/moderation";
import { useAdminPublishers, type RealPublisher } from "@/hooks/useAdminPublishers";

export function PublishersTab({ initialQuery }: { initialQuery?: string }) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery ?? "");
  const { publishers, refresh } = useAdminPublishers(query);
  const [managing, setManaging] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("admin.publishersTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("admin.publishersSubtitle")}</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> {t("admin.newPublisher")}
        </button>
      </div>

      {creating && (
        <NewPublisherForm
          onDone={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.usersSearchPlaceholder")}
          className="w-full rounded-control border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("admin.colPublisher")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colType")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colVerified")}</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {publishers.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="flex items-center gap-2.5 px-4 py-3">
                    <PlaceholderImage seed={p.id} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
                    {p.name}
                  </td>
                  <td className="px-4 py-3 capitalize text-neutral-600">{p.type.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    {isPublisherIdle(p) ? (
                      <span className="rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                        {t("admin.superAdmin.restricted")}
                      </span>
                    ) : p.verified ? (
                      <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                        {t("admin.verified")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
                        {t("admin.unverified")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setManaging(managing === p.id ? null : p.id)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {managing === p.id ? t("common.close") : t("admin.manage")}
                    </button>
                  </td>
                </tr>
                {managing === p.id && (
                  <tr>
                    <td colSpan={4} className="bg-neutral-50 px-4 py-4">
                      <PublisherManagePanel publisher={p} onDone={refresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm";
const labelClass = "mb-1 block text-xs font-medium text-neutral-500";

function NewPublisherForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useT();
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"private_owner" | "agency" | "developer">("agency");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = ownerName.trim() && ownerEmail.trim() && ownerPassword.length >= 8 && name.trim() && phone.trim();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/publishers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName,
          ownerEmail,
          ownerPassword,
          name,
          type,
          phone,
          whatsapp: whatsapp.trim() || undefined,
          bio: bio.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ? (typeof b.error === "string" ? b.error : JSON.stringify(b.error)) : "Create failed.");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-4">
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("admin.newPublisherOwnerSection")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherOwnerName")}</span>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherOwnerEmail")}</span>
            <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherOwnerPassword")}</span>
            <input type="text" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} className={inputClass} />
          </label>
        </div>
      </div>

      <div className="border-t border-neutral-200 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("admin.newPublisherOrgSection")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherOrgName")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherType")}</span>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputClass}>
              <option value="agency">{t("publisher.typeAgency")}</option>
              <option value="developer">{t("publisher.typeDeveloper")}</option>
              <option value="private_owner">{t("publisher.typePrivateOwner")}</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherPhone")}</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>{t("admin.newPublisherWhatsapp")}</span>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={inputClass} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>{t("admin.newPublisherBio")}</span>
            <input value={bio} onChange={(e) => setBio(e.target.value)} className={inputClass} />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-200 pt-3">
        <button
          disabled={busy || !valid}
          onClick={submit}
          className="rounded-control bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {t("admin.newPublisherSubmit")}
        </button>
        <button onClick={onCancel} className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

function PublisherManagePanel({ publisher, onDone }: { publisher: RealPublisher; onDone: () => void }) {
  const { t } = useT();
  const [restrictedDays, setRestrictedDays] = useState(7);
  const [reason, setReason] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/publishers/${publisher.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ? JSON.stringify(b.error) : "Update failed.");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => patch({ verified: !publisher.verified })}
          className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          {publisher.verified ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {publisher.verified ? t("admin.removeVerification") : t("admin.verify")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.idleDaysLabel")}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={restrictedDays}
            onChange={(e) => setRestrictedDays(Number(e.target.value))}
            className="w-20 rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.reasonLabel")}</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </div>
        <button
          disabled={busy || !reason.trim()}
          onClick={() => patch({ restricted: true, restrictedReason: reason, restrictedDays })}
          className="flex items-center gap-1.5 rounded-control bg-warning/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Ban className="h-3.5 w-3.5" /> {t("admin.makeIdle")}
        </button>
        {publisher.restricted && (
          <button
            disabled={busy}
            onClick={() => patch({ restricted: false })}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("admin.restore")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.newPasswordLabel")}</span>
          <input
            type="text"
            value={newOwnerPassword}
            onChange={(e) => setNewOwnerPassword(e.target.value)}
            placeholder={t("admin.newPasswordPlaceholder")}
            className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          disabled={busy || newOwnerPassword.length < 4}
          onClick={() => patch({ newOwnerPassword }).then(() => setNewOwnerPassword(""))}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <KeyRound className="h-3.5 w-3.5" /> {t("admin.resetPassword")}
        </button>
      </div>
    </div>
  );
}
