"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import type { Publisher } from "@/lib/types";

const ROLE_LABEL_KEY: Record<string, string> = {
  owner: "team.roleOwner",
  admin: "team.roleAdmin",
  agent: "team.roleAgent",
  content_editor: "team.roleContentEditor",
  viewer: "team.roleViewer",
};
const INVITABLE_ROLES = ["admin", "agent", "content_editor", "viewer"] as const;

interface OrgProfile {
  name: string;
  logoUrl: string | null;
  phone: string;
  whatsapp: string | null;
  bio: string | null;
  legalName: string | null;
  registrationNumber: string | null;
  businessAddress: string | null;
  companyEmail: string | null;
  website: string | null;
  verificationStatus: string;
  verificationRejectionReason: string | null;
  developerStatus: string;
}

const VERIFICATION_STATUS_LABEL_KEY: Record<string, string> = {
  not_submitted: "company.verificationNotSubmitted",
  pending: "company.verificationPending",
  verified: "company.verificationVerified",
  rejected: "company.verificationRejected",
  reverify_required: "company.verificationReverifyRequired",
};

interface TeamMemberRow {
  membershipId: string;
  name: string;
  email: string | null;
  role: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface OwnerRow {
  id: string;
  name: string;
  email: string | null;
}

/** Account & Profile System PRD v1.0 §9 "Business Publisher & Organization
 * Profile" + §8 "Business Teams, Roles & Permissions" — real
 * Publisher/OrganizationMembership/OrganizationInvitation data, replacing
 * this tab's previous fully-local Zustand `teamMembers` mock. Any team
 * member can view; only Owner/Org Admin (`canManage`, mirroring the
 * server's real `requireOrgRole()` gate) can edit the company profile or
 * the roster — everyone else sees the same data read-only. */
export function CompanyProfileTab({ publisher }: { publisher: Publisher }) {
  const { t } = useT();
  const orgRole = useAppStore((s) => s.auth.orgRole);
  const canManage = orgRole === "owner" || orgRole === "admin";

  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [owner, setOwner] = useState<OwnerRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITABLE_ROLES)[number]>("agent");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [requestingVerification, setRequestingVerification] = useState(false);

  function loadOrg() {
    fetch("/api/business/organization")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setOrg(data);
        setForm({
          name: data.name ?? "",
          phone: data.phone ?? "",
          whatsapp: data.whatsapp ?? "",
          bio: data.bio ?? "",
          legalName: data.legalName ?? "",
          registrationNumber: data.registrationNumber ?? "",
          businessAddress: data.businessAddress ?? "",
          companyEmail: data.companyEmail ?? "",
          website: data.website ?? "",
        });
      })
      .catch(() => {});
  }
  function loadTeam() {
    fetch("/api/business/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setOwner(data.owner);
        setMembers(data.members);
        setInvitations(data.invitations);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadOrg();
    loadTeam();
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/business/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      loadOrg();
      setTimeout(() => setSaved(false), 3000);
    }
  }

  async function handleInvite() {
    setInviteError(null);
    if (!inviteEmail.trim()) return;
    const res = await fetch("/api/business/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setInviteError(body?.error ?? t("company.inviteFailed"));
      return;
    }
    setInviteEmail("");
    loadTeam();
  }

  async function changeMemberRole(membershipId: string, role: string) {
    await fetch("/api/business/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId, role }),
    });
    loadTeam();
  }
  async function removeMember(membershipId: string) {
    await fetch(`/api/business/team?membershipId=${encodeURIComponent(membershipId)}`, { method: "DELETE" });
    setMembers((m) => m.filter((x) => x.membershipId !== membershipId));
  }
  async function revokeInvitation(id: string) {
    await fetch(`/api/business/team/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
    setInvitations((v) => v.filter((x) => x.id !== id));
  }

  async function requestVerification() {
    setRequestingVerification(true);
    const res = await fetch("/api/business/verification-request", { method: "POST" });
    setRequestingVerification(false);
    if (res.ok) loadOrg();
  }

  if (!org) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-xl text-neutral-900">{publisher.name}</h1>
        <p className="text-sm text-neutral-400">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("dashboard.tabCompanyProfile")}</h1>
        <p className="text-sm text-neutral-500">{t("company.subtitle")}</p>
      </div>

      <div className="space-y-4 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-neutral-900">{t("company.publicProfile")}</h2>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                org.verificationStatus === "verified"
                  ? "bg-green-100 text-green-700"
                  : org.verificationStatus === "pending"
                    ? "bg-amber-50 text-amber-700"
                    : org.verificationStatus === "rejected" || org.verificationStatus === "reverify_required"
                      ? "bg-red-50 text-red-700"
                      : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {t(VERIFICATION_STATUS_LABEL_KEY[org.verificationStatus] ?? "company.verificationNotSubmitted")}
            </span>
            {canManage &&
              (org.verificationStatus === "not_submitted" ||
                org.verificationStatus === "rejected" ||
                org.verificationStatus === "reverify_required") && (
                <button
                  disabled={requestingVerification}
                  onClick={requestVerification}
                  className="rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {requestingVerification ? t("common.loading") : t("company.requestVerification")}
                </button>
              )}
          </div>
        </div>
        {org.verificationStatus === "rejected" && org.verificationRejectionReason && (
          <p className="rounded-control bg-red-50 px-3 py-2 text-xs text-red-700">
            {t("company.verificationRejectionReason", { reason: org.verificationRejectionReason })}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("dashboard.displayName")} value={form.name} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field label={t("dashboard.phone")} value={form.phone} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <Field label={t("dashboard.whatsapp")} value={form.whatsapp} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} />
          <Field label={t("company.website")} value={form.website} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, website: v }))} />
          <Field label={t("company.legalName")} value={form.legalName} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, legalName: v }))} />
          <Field label={t("company.registrationNumber")} value={form.registrationNumber} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, registrationNumber: v }))} />
          <Field label={t("company.companyEmail")} value={form.companyEmail} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, companyEmail: v }))} />
          <Field label={t("company.businessAddress")} value={form.businessAddress} disabled={!canManage} onChange={(v) => setForm((f) => ({ ...f, businessAddress: v }))} />
        </div>
        {canManage && (
          <button
            disabled={saving}
            onClick={handleSave}
            className="rounded-control bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? t("common.loading") : t("dashboard.saveChanges")}
          </button>
        )}
        {saved && (
          <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            {t("company.profileSaved")}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold text-neutral-900">{t("company.team")}</h2>
        <div className="space-y-2">
          {owner && (
            <div className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-100 bg-neutral-50 p-2.5">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-800">
                {owner.name} <span className="font-normal text-neutral-400">({owner.email})</span>
              </p>
              <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600">
                {t(ROLE_LABEL_KEY.owner)}
              </span>
            </div>
          )}
          {members.map((m) => (
            <div key={m.membershipId} className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-100 p-2.5">
              <p className="min-w-0 flex-1 truncate text-xs text-neutral-700">
                {m.name} <span className="text-neutral-400">({m.email})</span>
              </p>
              <select
                value={m.role}
                disabled={!canManage}
                onChange={(e) => changeMemberRole(m.membershipId, e.target.value)}
                className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-60"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABEL_KEY[r])}
                  </option>
                ))}
              </select>
              {canManage && (
                <button
                  onClick={() => removeMember(m.membershipId)}
                  aria-label={t("company.removeMember")}
                  className="shrink-0 rounded-control p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {invitations.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-neutral-200 p-2.5">
              <p className="min-w-0 flex-1 truncate text-xs text-neutral-500">{i.email}</p>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                {t("company.invitationPending")} · {t(ROLE_LABEL_KEY[i.role] ?? "team.roleViewer")}
              </span>
              {canManage && (
                <button
                  onClick={() => revokeInvitation(i.id)}
                  aria-label={t("company.revokeInvitation")}
                  className="shrink-0 rounded-control p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t("company.inviteEmailPlaceholder")}
              className="min-w-0 flex-1 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof INVITABLE_ROLES)[number])}
              className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700"
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(ROLE_LABEL_KEY[r])}
                </option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              className="flex items-center gap-1 rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
            >
              <Plus className="h-3.5 w-3.5" /> {t("company.addMember")}
            </button>
          </div>
        )}
        {inviteError && <p className="text-xs font-medium text-red-600">{inviteError}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500"
      />
    </label>
  );
}
