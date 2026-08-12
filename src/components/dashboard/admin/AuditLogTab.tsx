"use client";

import { ScrollText } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";

/** Admin's Audit Log (PRD_ROZARIS_User_Types §5 "Every sensitive action
 * writes to the Audit Log with actor, action, entity, before/after and
 * timestamp") — reads the session-local `auditLog` Zustand slice, which a
 * handful of real action sites in this prototype already append to
 * (Approvals Queue, Timeline approve/reject, Currency rate change,
 * Verification/Moderation decisions, Lead status changes). Becomes the
 * real Prisma `AuditLog` table in the backend-wiring phase — see the
 * Rozaris backend plan memory. */
export function AuditLogTab() {
  const { t, locale } = useT();
  const auditLog = useAppStore((s) => s.auditLog);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.auditLogTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.auditLogSubtitle")}</p>
      </div>

      {auditLog.length === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.auditLogEmpty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {auditLog.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div className="min-w-0">
                  <p className="text-sm text-neutral-800">
                    <span className="font-semibold">{entry.actor}</span> — {entry.action}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{entry.entity}</p>
                </div>
                <span className="ml-auto shrink-0 text-xs text-neutral-400">
                  {formatRelativeDate(entry.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
