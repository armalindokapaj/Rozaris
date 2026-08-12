"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import type { Publisher, TeamMember, TeamRole } from "@/lib/types";

const ROLE_LABEL_KEY: Record<TeamRole, string> = {
  owner: "team.roleOwner",
  manager: "team.roleManager",
  sales: "team.roleSales",
  marketing: "team.roleMarketing",
  viewer: "team.roleViewer",
};

const ROLES: TeamRole[] = ["owner", "manager", "sales", "marketing", "viewer"];

function seedTeam(publisher: Publisher): TeamMember[] {
  return [
    { id: `${publisher.id}-tm-1`, name: publisher.name, email: `hello@${publisher.slug}.al`, role: "owner" },
  ];
}

/** Business Publisher's public Company Profile + internal team roster
 * (PRD_ROZARIS_User_Types §4 "Company & team") — the Verified badge stays
 * Admin-controlled (read-only here, matches PublishersTab in the Admin
 * console); team roles are informational only in this prototype, no real
 * per-seat permission enforcement yet (that needs real auth, see the
 * Rozaris backend plan memory). */
export function CompanyProfileTab({ publisher }: { publisher: Publisher }) {
  const { t } = useT();
  const teamMembers = useAppStore((s) => s.teamMembers[publisher.id]);
  const setTeamMembers = useAppStore((s) => s.setTeamMembers);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!teamMembers) setTeamMembers(publisher.id, seedTeam(publisher));
  }, [publisher, teamMembers, setTeamMembers]);

  const members = teamMembers ?? seedTeam(publisher);

  function updateMember(id: string, partial: Partial<TeamMember>) {
    setTeamMembers(publisher.id, members.map((m) => (m.id === id ? { ...m, ...partial } : m)));
  }
  function removeMember(id: string) {
    setTeamMembers(publisher.id, members.filter((m) => m.id !== id));
  }
  function addMember() {
    setTeamMembers(publisher.id, [
      ...members,
      { id: `${publisher.id}-tm-${Date.now()}`, name: "", email: "", role: "viewer" },
    ]);
  }
  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.tabCompanyProfile")}</h1>
        <p className="text-sm text-neutral-500">{t("company.subtitle")}</p>
      </div>

      <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900">{t("company.publicProfile")}</h2>
          {publisher.verified ? (
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
              {t("admin.verified")}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
              {t("admin.unverified")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("dashboard.displayName")} defaultValue={publisher.name} />
          <Field label={t("dashboard.phone")} defaultValue={publisher.phone} />
          <Field label={t("dashboard.whatsapp")} defaultValue={publisher.whatsapp} />
          <Field label={t("company.city")} defaultValue={publisher.city ?? ""} />
        </div>
        <button
          onClick={handleSave}
          className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          {t("dashboard.saveChanges")}
        </button>
        {saved && (
          <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            {t("company.profileSaved")}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900">{t("company.team")}</h2>
          <button
            onClick={addMember}
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("company.addMember")}
          </button>
        </div>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-100 p-2.5">
              <input
                value={m.name}
                onChange={(e) => updateMember(m.id, { name: e.target.value })}
                placeholder={t("company.memberName")}
                className="min-w-0 flex-1 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs"
              />
              <input
                value={m.email}
                onChange={(e) => updateMember(m.id, { email: e.target.value })}
                placeholder={t("company.memberEmail")}
                className="min-w-0 flex-1 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs"
              />
              <select
                value={m.role}
                onChange={(e) => updateMember(m.id, { role: e.target.value as TeamRole })}
                className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABEL_KEY[r])}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeMember(m.id)}
                aria-label={t("company.removeMember")}
                className="shrink-0 rounded-control p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <input
        defaultValue={defaultValue}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
