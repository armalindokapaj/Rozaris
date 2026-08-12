"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

const STYLES = {
  ready: { icon: CheckCircle2, className: "bg-green-100 text-green-700" },
  warning: { icon: AlertTriangle, className: "bg-amber-100 text-amber-700" },
  blocked: { icon: XCircle, className: "bg-red-100 text-red-700" },
} as const;

/** Shared status pill for the versioned 3D pipeline's server-side GLB
 * validation result (src/lib/glbValidate.ts) — PRD_Admin_Mapbox_GLB §6 /
 * PRD_Admin_3D_Project_Experience §9's READY/WARNING/BLOCKED table. Shows
 * the issue list on click when there is one. */
export function ValidationBadge({
  status,
  issues,
}: {
  status: "ready" | "warning" | "blocked";
  issues?: string[] | null;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const { icon: Icon, className } = STYLES[status];
  const label = t(`admin.validation${status[0].toUpperCase()}${status.slice(1)}`);
  const hasIssues = !!issues && issues.length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => hasIssues && setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
          className,
          hasIssues && "cursor-pointer"
        )}
      >
        <Icon className="h-3 w-3" /> {label}
      </button>
      {open && hasIssues && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-56 list-disc space-y-1 rounded-panel border border-neutral-200 bg-white p-3 pl-6 text-[11px] text-neutral-600 shadow-[var(--shadow-1)]">
          {issues!.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
