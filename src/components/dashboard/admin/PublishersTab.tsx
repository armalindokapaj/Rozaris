"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { publishers as mockPublishers } from "@/lib/mockData";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

interface RealPublisher {
  id: string;
  slug: string;
  name: string;
  type: string;
  verified: boolean;
  restricted: boolean;
}

/** Publisher directory — seeded catalog (`lib/mockData.ts`, the platform's
 * established businesses) plus real signed-up Publisher rows
 * (`GET /api/admin/publishers`, already built for the Account Controls
 * picker, now reused here so Global Admin Search has something real to
 * land a matched publisher on). `initialQuery` seeds the filter box the
 * same way UsersTab's does — see that component's doc comment for why it's
 * a prop, not the URL. */
export function PublishersTab({ initialQuery }: { initialQuery?: string }) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [realPublishers, setRealPublishers] = useState<RealPublisher[]>([]);

  useEffect(() => {
    let cancelled = false;
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    fetch(`/api/admin/publishers${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RealPublisher[]) => {
        if (!cancelled) setRealPublishers(rows);
      })
      .catch(() => {
        if (!cancelled) setRealPublishers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const needle = query.toLowerCase();
  const filteredMock = mockPublishers.filter((p) => p.name.toLowerCase().includes(needle));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.publishersTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.publishersSubtitle")}</p>
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
              <th className="px-4 py-2.5 font-medium">{t("admin.colPublisher")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colType")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colVerified")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {realPublishers.map((p) => (
              <tr key={p.id}>
                <td className="flex items-center gap-2.5 px-4 py-3">
                  <PlaceholderImage seed={p.id} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
                  {p.name}
                </td>
                <td className="px-4 py-3 capitalize text-neutral-600">{p.type.replace("_", " ")}</td>
                <td className="px-4 py-3">
                  {p.restricted ? (
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
              </tr>
            ))}
            {filteredMock.map((p) => (
              <tr key={p.id}>
                <td className="flex items-center gap-2.5 px-4 py-3">
                  <PlaceholderImage seed={p.id} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
                  {p.name}
                </td>
                <td className="px-4 py-3 capitalize text-neutral-600">{p.type.replace("_", " ")}</td>
                <td className="px-4 py-3">
                  {p.verified ? (
                    <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                      {t("admin.verified")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
                      {t("admin.unverified")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
