"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

interface RealUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
}

/** Admin's Users tab (PRD_ROZARIS_User_Types §5 "Users, publishers &
 * developers") — a searchable roster. Two sources, same combine convention
 * as the rest of this console: the five fixed demo personas
 * (src/lib/demoAccounts.ts, this prototype's mock sign-in identities — see
 * that file's own doc comment) plus real signed-up accounts from the real
 * User table (`GET /api/admin/users`, previously built but not wired to
 * any UI — Global Admin Search now links a matched real user here, so this
 * had to actually be able to show one). `initialQuery` (from the top bar's
 * search, via `admin/page.tsx`'s own nav state, not the URL — this tab
 * switch doesn't navigate to a new route) seeds the search box so a search
 * result lands pre-filtered. Suspend/edit stay inert — no real
 * account-status write path from *this* tab yet (Account Controls, under
 * Audit Log, has one). */
export function UsersTab({ initialQuery }: { initialQuery?: string }) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [realUsers, setRealUsers] = useState<RealUser[]>([]);

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
      a.username.toLowerCase().includes(query.toLowerCase())
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
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {realUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="flex items-center gap-2.5 px-4 py-3">
                      <PlaceholderImage seed={u.id} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-800">{u.name ?? t("admin.usersUnnamed")}</p>
                        <p className="truncate text-xs text-neutral-400">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-neutral-600">{u.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.status === "active"
                            ? "rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success"
                            : "rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger"
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                  </tr>
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
                <tr key={a.username}>
                  <td className="flex items-center gap-2.5 px-4 py-3">
                    <PlaceholderImage
                      seed={a.username}
                      kind="avatar"
                      className="h-8 w-8 rounded-lg"
                      iconClassName="h-3.5 w-3.5"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-800">{a.displayName}</p>
                      <p className="truncate text-xs text-neutral-400">@{a.username}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{a.typeLabel}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                      {t("admin.statusActive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs font-semibold text-neutral-400" disabled>
                      {t("admin.suspend")}
                    </button>
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
