"use client";

import { Fragment, useEffect, useState } from "react";
import { Search, KeyRound, Ban, CheckCircle2 } from "lucide-react";
import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { isUserIdle } from "@/lib/moderation";

interface RealUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  statusUntil: string | null;
  superAdmin: boolean;
  adminScopes: string[];
}

const ADMIN_SCOPES = ["listing_reviewer", "publisher_verification", "3d_manager", "content_manager", "finance_admin", "support_admin"];

/** Admin's Users tab (PRD_ROZARIS_User_Types §5 "Users, publishers &
 * developers") — a searchable roster. Two sources, same combine convention
 * as the rest of this console: the five fixed demo personas
 * (src/lib/demoAccounts.ts) plus real signed-up accounts from the real
 * User table. Real accounts now get a real management panel — edit name,
 * set status (with a time-bound idle window), reset password, and (Super
 * Admin only) grant the admin role + scopes, all via the real
 * `PATCH /api/admin/users/[id]` route (see the "Rozaris Platform Audit"
 * memory) — this used to be inert, no write path from this tab at all. */
export function UsersTab({ initialQuery, isSuperAdmin }: { initialQuery?: string; isSuperAdmin?: boolean }) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [realUsers, setRealUsers] = useState<RealUser[]>([]);
  const [managing, setManaging] = useState<string | null>(null);

  function refresh() {
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    fetch(`/api/admin/users${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RealUser[]) => setRealUsers(rows))
      .catch(() => setRealUsers([]));
  }

  useEffect(() => {
    let cancelled = false;
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    fetch(`/api/admin/users${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RealUser[]) => {
        if (!cancelled) setRealUsers(rows);
      })
      .catch(() => {
        if (!cancelled) setRealUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const filteredDemo = DEMO_ACCOUNTS.filter(
    (a) =>
      a.displayName.toLowerCase().includes(query.toLowerCase()) ||
      a.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.usersTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.usersSubtitle")}</p>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.usersSearchPlaceholder")}
          className="w-full rounded-control border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none"
        />
      </div>

      {realUsers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("admin.usersRealSection")}</p>
          <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("admin.colUser")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("admin.colAccountType")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("admin.colStatus")}</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {realUsers.map((u) => (
                  <Fragment key={u.id}>
                    <tr>
                      <td className="flex items-center gap-2.5 px-4 py-3">
                        <PlaceholderImage seed={u.id} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-800">{u.name ?? t("admin.usersUnnamed")}</p>
                          <p className="truncate text-xs text-neutral-400">{u.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-neutral-600">
                        {u.role}
                        {u.superAdmin && <span className="ml-1.5 text-[10px] font-bold text-brand-600">SUPER</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            isUserIdle(u)
                              ? "rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger"
                              : "rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success"
                          }
                        >
                          {u.status}
                          {u.status === "restricted" && u.statusUntil && ` · ${new Date(u.statusUntil).toLocaleDateString()}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setManaging(managing === u.id ? null : u.id)}
                          className="text-xs font-semibold text-brand-600 hover:underline"
                        >
                          {managing === u.id ? t("common.close") : t("admin.manage")}
                        </button>
                      </td>
                    </tr>
                    {managing === u.id && (
                      <tr>
                        <td colSpan={4} className="bg-neutral-50 px-4 py-4">
                          <UserManagePanel user={u} isSuperAdmin={!!isSuperAdmin} onDone={refresh} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {realUsers.length > 0 && (
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("admin.usersDemoSection")}</p>
        )}
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("admin.colUser")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.colAccountType")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.colStatus")}</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredDemo.map((a) => (
                <tr key={a.email}>
                  <td className="flex items-center gap-2.5 px-4 py-3">
                    <PlaceholderImage
                      seed={a.email}
                      kind="avatar"
                      className="h-8 w-8 rounded-lg"
                      iconClassName="h-3.5 w-3.5"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-800">{a.displayName}</p>
                      <p className="truncate text-xs text-neutral-400">{a.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{a.typeLabel}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                      {t("admin.statusActive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-neutral-400">{t("admin.usersManageInRealSection")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UserManagePanel({ user, isSuperAdmin, onDone }: { user: RealUser; isSuperAdmin: boolean; onDone: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(user.name ?? "");
  const [idleDays, setIdleDays] = useState(7);
  const [reason, setReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [scopes, setScopes] = useState<string[]>(user.adminScopes);
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
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

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.colUser")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          disabled={busy || !name.trim()}
          onClick={() => patch({ name })}
          className="rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {t("common.save")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.idleDaysLabel")}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={idleDays}
            onChange={(e) => setIdleDays(Number(e.target.value))}
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
          onClick={() => patch({ status: "restricted", statusReason: reason, idleDays })}
          className="flex items-center gap-1.5 rounded-control bg-warning/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Ban className="h-3.5 w-3.5" /> {t("admin.makeIdle")}
        </button>
        {user.status !== "active" && (
          <button
            disabled={busy}
            onClick={() => patch({ status: "active", statusReason: "Restored by admin" })}
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
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("admin.newPasswordPlaceholder")}
            className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          disabled={busy || newPassword.length < 4}
          onClick={() => patch({ newPassword }).then(() => setNewPassword(""))}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <KeyRound className="h-3.5 w-3.5" /> {t("admin.resetPassword")}
        </button>
      </div>

      {isSuperAdmin && (
        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <span className="block text-xs font-medium text-neutral-500">{t("admin.roleAndScopesLabel")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            >
              <option value="buyer">buyer</option>
              <option value="publisher">publisher</option>
              <option value="admin">admin</option>
            </select>
            <button
              disabled={busy}
              onClick={() => patch({ role })}
              className="rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {t("common.save")}
            </button>
          </div>
          {role === "admin" && (
            <div className="flex flex-wrap gap-1.5">
              {ADMIN_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScopes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}
                  className={
                    scopes.includes(s)
                      ? "rounded-pill border border-brand-500 bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white"
                      : "rounded-pill border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                  }
                >
                  {s}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={() => patch({ adminScopes: scopes })}
                className="rounded-pill bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                {t("common.save")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
