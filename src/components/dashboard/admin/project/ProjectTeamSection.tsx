"use client";

import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { Badge, Btn, EmptyState, ErrorNote, Panel, SectionHeader, inputClass, narrowInputClass } from "./kit";

const ROLES = ["project_admin", "inventory_manager", "sales_manager", "analytics_viewer"] as const;
type Role = (typeof ROLES)[number];

interface Membership {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

export function ProjectTeamSection({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const { t } = useT();
  const [members, setMembers] = useState<Membership[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("inventory_manager");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/projects/${projectId}/members`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Membership[]) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);
  const load = () => setReloadKey((k) => k + 1);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : t("projectManager.memberAddFailed"));
      }
      setEmail("");
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectManager.memberAddFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(membershipId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/members/${membershipId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("projectManager.memberRemoveFailed"));
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectManager.memberRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.teamTitle")} description={t("projectManager.teamDescription")} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Panel title={t("projectManager.grantAccessTitle")}>
        <form onSubmit={add} className="flex flex-wrap gap-1.5">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("projectManager.memberEmailPlaceholder")}
            className={`${inputClass} min-w-[220px] flex-1`}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`${narrowInputClass} shrink-0`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`projectManager.projectRole.${r}`)}
              </option>
            ))}
          </select>
          <Btn type="submit" variant="primary" disabled={busy || !email.trim()} className="shrink-0">
            <UserPlus className="h-3.5 w-3.5" />
            {t("projectManager.grantAccess")}
          </Btn>
        </form>
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">{t("projectManager.roleExplainer")}</p>
      </Panel>

      <Panel title={t("projectManager.membersTitle", { count: members?.length ?? 0 })}>
        {members === null ? (
          <p className="py-4 text-center text-xs text-neutral-400">{t("admin.loading")}</p>
        ) : members.length === 0 ? (
          <EmptyState>{t("projectManager.noMembers")}</EmptyState>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{m.user.name ?? m.user.email}</p>
                  <p className="truncate text-xs text-neutral-500">{m.user.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="info">{t(`projectManager.projectRole.${m.role}`)}</Badge>
                  <button
                    onClick={() => {
                      if (confirm(t("projectManager.confirmRemoveMember", { email: m.user.email }))) void remove(m.id);
                    }}
                    disabled={busy}
                    aria-label={t("projectManager.removeMember")}
                    className="rounded-control p-1.5 text-neutral-400 hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
