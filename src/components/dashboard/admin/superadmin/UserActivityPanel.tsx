"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityLabel?: string | null;
  ip?: string | null;
  createdAt: string;
}

function ActivityFeed({ rows, emptyKey }: { rows: AuditRow[]; emptyKey: string }) {
  const { t, locale } = useT();
  if (rows.length === 0) return <p className="text-xs text-neutral-400">{t(emptyKey)}</p>;
  return (
    <ul className="divide-y divide-neutral-100 rounded-panel border border-neutral-200 bg-white">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-3 px-4 py-2.5">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-800">{row.action}</p>
            <p className="truncate text-xs text-neutral-500">
              {row.entityType} · {row.entityLabel ?? ""} {row.ip ? `· ${row.ip}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-xs text-neutral-400">{formatRelativeDate(row.createdAt, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

export function UserActivityPanel() {
  const { t } = useT();
  const [userId, setUserId] = useState("");
  const [user, setUser] = useState<{ name: string; email: string | null } | null>(null);
  const [asActor, setAsActor] = useState<AuditRow[]>([]);
  const [aboutThem, setAboutThem] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    if (!userId.trim()) return;
    setLoading(true);
    setNotFound(false);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/activity`);
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setAsActor(data.asActor);
      setAboutThem(data.aboutThem);
    } else {
      setUser(null);
      setNotFound(true);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.userActivityTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.userActivitySubtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t("admin.superAdmin.userIdPlaceholder")}
          className="min-w-[16rem] rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
        />
        <button
          onClick={load}
          disabled={loading || !userId.trim()}
          className="rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {loading ? t("admin.superAdmin.loading") : t("admin.superAdmin.lookUp")}
        </button>
      </div>

      {notFound && <p className="text-sm text-neutral-400">{t("admin.superAdmin.entityNotFound")}</p>}

      {user && (
        <>
          <p className="text-sm text-neutral-700">
            {user.name} {user.email ? `· ${user.email}` : ""}
          </p>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("admin.superAdmin.userActivityDidTitle")}
            </h3>
            <ActivityFeed rows={asActor} emptyKey="admin.superAdmin.userActivityDidEmpty" />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("admin.superAdmin.userActivityAboutTitle")}
            </h3>
            <ActivityFeed rows={aboutThem} emptyKey="admin.superAdmin.userActivityAboutEmpty" />
          </div>
        </>
      )}
    </div>
  );
}
