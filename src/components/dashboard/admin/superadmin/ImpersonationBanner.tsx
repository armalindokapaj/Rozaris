"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

export function ImpersonationBanner() {
  const { t } = useT();
  const [target, setTarget] = useState<{ id: string; name: string; email: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/admin/impersonate")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTarget(data?.active ? data.target : null))
      .catch(() => setTarget(null));
  }, []);

  if (!target) return null;

  async function end() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    setTarget(null);
    window.location.reload();
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white">
      <Eye className="h-3.5 w-3.5" />
      <span>{t("admin.superAdmin.impersonationBanner", { name: target.name })}</span>
      <button onClick={end} className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30">
        <X className="h-3 w-3" /> {t("admin.superAdmin.impersonationEnd")}
      </button>
    </div>
  );
}
