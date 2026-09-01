"use client";

import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

const ROLE_KEYS = [
  "superAdmin",
  "platformAdmin",
  "moderationAdmin",
  "publisherAdmin",
  "threeDAdmin",
  "contentAdmin",
  "financeAdmin",
  "supportAdmin",
  "readOnlyAnalyst",
] as const;

const ADMIN_ROSTER = [{ name: "Admin", roleKey: "superAdmin" as const }];

export function AdminTeamTab() {
  const { t } = useT();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.teamTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.teamSubtitle")}</p>
      </div>

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <ul className="divide-y divide-neutral-100">
          {ADMIN_ROSTER.map((m) => (
            <li key={m.name} className="flex items-center gap-3 px-4 py-3">
              <PlaceholderImage seed={m.name} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
              <p className="text-sm font-medium text-neutral-800">{m.name}</p>
              <span className="ml-auto rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                {t(`admin.role.${m.roleKey}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-neutral-900">{t("admin.rolesReferenceTitle")}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROLE_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2.5 rounded-card border border-neutral-200 bg-white p-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-brand-500" />
              <span className="text-sm text-neutral-700">{t(`admin.role.${key}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
