"use client";

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Eye, Search } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
}
interface PublisherRow {
  id: string;
  name: string;
  slug: string;
  verified: boolean;
  restricted: boolean;
  restrictedReason: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  restricted: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-700",
  disabled: "bg-neutral-200 text-neutral-600",
};

/** Account suspension/restoration for Users, and verify/restrict for
 * Publishers — the two "Account controls" surfaces named in the brief,
 * both real writes (`PATCH /api/admin/users/[id]`,
 * `PATCH /api/admin/publishers/[id]`), both reason-required for the
 * high-risk transitions. */
export function AccountControlsPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t } = useT();
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [publisherQuery, setPublisherQuery] = useState("");
  const [publishers, setPublishers] = useState<PublisherRow[]>([]);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  async function searchUsers() {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(userQuery)}`);
    if (res.ok) setUsers(await res.json());
  }
  async function searchPublishers() {
    const res = await fetch(`/api/admin/publishers?q=${encodeURIComponent(publisherQuery)}`);
    if (res.ok) setPublishers(await res.json());
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    searchUsers();
    searchPublishers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setUserStatus(id: string, status: string) {
    const statusReason = reasonDraft[id];
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, statusReason }),
    });
    if (res.ok) searchUsers();
  }

  async function viewAs(id: string) {
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: id }),
    });
    if (res.ok) window.location.reload();
  }

  async function setPublisherRestricted(id: string, restricted: boolean) {
    const restrictedReason = reasonDraft[id];
    const res = await fetch(`/api/admin/publishers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restricted, restrictedReason: restricted ? restrictedReason : undefined }),
    });
    if (res.ok) searchPublishers();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.accountControlsTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.accountControlsSubtitle")}</p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("admin.superAdmin.usersSection")}
        </h3>
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchUsers()}
              placeholder={t("admin.usersSearchPlaceholder")}
              className="w-full rounded-control border border-neutral-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-400 focus:outline-none"
            />
          </div>
          <button onClick={searchUsers} className="rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600">
            {t("admin.superAdmin.search")}
          </button>
        </div>
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium text-neutral-800">{u.name}</p>
                  <p className="text-xs text-neutral-400">{u.email}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[u.status] ?? ""}`}>
                  {u.status}
                </span>
                <input
                  value={reasonDraft[u.id] ?? ""}
                  onChange={(e) => setReasonDraft((s) => ({ ...s, [u.id]: e.target.value }))}
                  placeholder={t("admin.superAdmin.reasonPlaceholder")}
                  className="w-40 rounded-control border border-neutral-200 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                />
                {u.status === "suspended" || u.status === "disabled" ? (
                  <button
                    onClick={() => setUserStatus(u.id, "active")}
                    className="flex items-center gap-1 rounded-control border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("admin.superAdmin.restoreAccount")}
                  </button>
                ) : (
                  <button
                    onClick={() => setUserStatus(u.id, "suspended")}
                    className="flex items-center gap-1 rounded-control border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Ban className="h-3.5 w-3.5" /> {t("admin.suspend")}
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => viewAs(u.id)}
                    className="flex items-center gap-1 rounded-control border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                  >
                    <Eye className="h-3.5 w-3.5" /> {t("admin.superAdmin.viewAs")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("admin.superAdmin.publishersSection")}
        </h3>
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              value={publisherQuery}
              onChange={(e) => setPublisherQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPublishers()}
              placeholder={t("admin.superAdmin.publisherSearchPlaceholder")}
              className="w-full rounded-control border border-neutral-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-400 focus:outline-none"
            />
          </div>
          <button onClick={searchPublishers} className="rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600">
            {t("admin.superAdmin.search")}
          </button>
        </div>
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {publishers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium text-neutral-800">{p.name}</p>
                  <p className="text-xs text-neutral-400">
                    {p.verified ? t("admin.verified") : t("admin.unverified")}
                    {p.restricted ? ` · ${t("admin.superAdmin.restrictedLabel")}` : ""}
                  </p>
                </div>
                <input
                  value={reasonDraft[p.id] ?? ""}
                  onChange={(e) => setReasonDraft((s) => ({ ...s, [p.id]: e.target.value }))}
                  placeholder={t("admin.superAdmin.reasonPlaceholder")}
                  className="w-40 rounded-control border border-neutral-200 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                />
                {p.restricted ? (
                  <button
                    onClick={() => setPublisherRestricted(p.id, false)}
                    className="flex items-center gap-1 rounded-control border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t("admin.superAdmin.unrestrict")}
                  </button>
                ) : (
                  <button
                    onClick={() => setPublisherRestricted(p.id, true)}
                    className="flex items-center gap-1 rounded-control border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Ban className="h-3.5 w-3.5" /> {t("admin.superAdmin.restrict")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
