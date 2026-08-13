"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

const SCOPES = [
  "listing_reviewer",
  "publisher_verification",
  "3d_manager",
  "content_manager",
  "finance_admin",
  "support_admin",
];

interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  superAdmin: boolean;
  adminScopes: string[];
}

/** Permission overrides (PRD_ROZARIS_Admin §3 "Future Admin permission
 * scopes") — grant/revoke `superAdmin` and per-scope access for
 * `role: "admin"` users. Every write here is itself Super-Admin-gated
 * server-side (`PATCH /api/admin/users/[userId]` requires
 * `requireSuperAdmin()` the moment `superAdmin`/`adminScopes` are in the
 * body) — this panel only renders inside the Super Admin tab to begin
 * with, but the real enforcement is the route, not the render guard. */
export function PermissionsPanel() {
  const { t } = useT();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/users?role=admin");
    if (res.ok) setAdmins(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function update(userId: string, data: { superAdmin?: boolean; adminScopes?: string[] }) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) load();
  }

  function toggleScope(admin: AdminUser, scope: string) {
    const next = admin.adminScopes.includes(scope)
      ? admin.adminScopes.filter((s) => s !== scope)
      : [...admin.adminScopes, scope];
    update(admin.id, { adminScopes: next });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.permissionsTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.permissionsSubtitle")}</p>
      </div>

      {!loading && admins.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.superAdmin.permissionsEmpty")}
        </p>
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <div key={admin.id} className="rounded-panel border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{admin.name}</p>
                  <p className="text-xs text-neutral-400">{admin.email}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                  <input
                    type="checkbox"
                    checked={admin.superAdmin}
                    onChange={(e) => update(admin.id, { superAdmin: e.target.checked })}
                  />
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
                  {t("admin.superAdmin.superAdminLabel")}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {SCOPES.map((scope) => (
                  <button
                    key={scope}
                    onClick={() => toggleScope(admin, scope)}
                    disabled={admin.superAdmin}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
                      admin.adminScopes.includes(scope)
                        ? "border-brand-400 bg-brand-50 text-brand-700"
                        : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
              {admin.superAdmin && (
                <p className="mt-2 text-xs text-neutral-400">{t("admin.superAdmin.superAdminImpliesAll")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
