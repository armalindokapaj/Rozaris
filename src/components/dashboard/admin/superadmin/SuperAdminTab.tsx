"use client";

import { useEffect, useState } from "react";
import {
  ScrollText,
  Trash2,
  History,
  Activity,
  KeyRound,
  UserCog,
  HeartPulse,
  SearchCheck,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { AuditLogPanel } from "./AuditLogPanel";
import { RecycleBinPanel } from "./RecycleBinPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { UserActivityPanel } from "./UserActivityPanel";
import { PermissionsPanel } from "./PermissionsPanel";
import { AccountControlsPanel } from "./AccountControlsPanel";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { DataIntegrityPanel } from "./DataIntegrityPanel";

const SECTIONS = [
  { id: "auditLog", labelKey: "admin.tabAuditLog", icon: ScrollText },
  { id: "recycleBin", labelKey: "admin.superAdmin.navRecycleBin", icon: Trash2 },
  { id: "versionHistory", labelKey: "admin.superAdmin.navVersionHistory", icon: History },
  { id: "userActivity", labelKey: "admin.superAdmin.navUserActivity", icon: Activity },
  { id: "accountControls", labelKey: "admin.superAdmin.navAccountControls", icon: UserCog },
  { id: "permissions", labelKey: "admin.superAdmin.navPermissions", icon: KeyRound },
  { id: "systemHealth", labelKey: "admin.superAdmin.navSystemHealth", icon: HeartPulse },
  { id: "dataIntegrity", labelKey: "admin.superAdmin.navDataIntegrity", icon: SearchCheck },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export function SuperAdminTab({ initialSection }: { initialSection?: SectionId }) {
  const { t } = useT();
  const [section, setSection] = useState<SectionId>(initialSection ?? "auditLog");
  const [me, setMe] = useState<{ superAdmin: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe);
  }, []);

  const isSuperAdmin = Boolean(me?.superAdmin);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-control px-3 py-2 text-left text-sm font-medium transition-colors",
              section === s.id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            )}
          >
            <s.icon className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{t(s.labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {section === "auditLog" && <AuditLogPanel />}
        {section === "recycleBin" && <RecycleBinPanel isSuperAdmin={isSuperAdmin} />}
        {section === "versionHistory" && <VersionHistoryPanel />}
        {section === "userActivity" && <UserActivityPanel />}
        {section === "accountControls" && <AccountControlsPanel isSuperAdmin={isSuperAdmin} />}
        {section === "permissions" &&
          (isSuperAdmin ? (
            <PermissionsPanel />
          ) : (
            <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
              {t("admin.superAdmin.superAdminOnly")}
            </p>
          ))}
        {section === "systemHealth" && <SystemHealthPanel />}
        {section === "dataIntegrity" && <DataIntegrityPanel />}
      </div>
    </div>
  );
}
