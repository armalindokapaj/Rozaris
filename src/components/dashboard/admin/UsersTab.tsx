"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

/** Admin's Users tab (PRD_ROZARIS_User_Types §5 "Users, publishers &
 * developers") — a searchable roster. This prototype's only real "users"
 * are the five demo personas (src/lib/demoAccounts.ts); a real deployment
 * reads this from the User table instead. Suspend/edit actions are shown
 * but intentionally inert — no backend to write to yet (see the Rozaris
 * backend plan memory's "auth not wired into the UI" gap). */
export function UsersTab() {
  const { t } = useT();
  const [query, setQuery] = useState("");

  const filtered = DEMO_ACCOUNTS.filter(
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
            {filtered.map((a) => (
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
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
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
  );
}
