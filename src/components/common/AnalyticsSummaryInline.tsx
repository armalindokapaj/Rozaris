"use client";

import { useEffect, useState } from "react";
import { Eye, MessageCircle, Phone } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import type { AnalyticsSummary } from "@/app/api/analytics/summary/route";

/** Real per-post view/contact-click counts — the listing/project owner's
 * own dashboard row and the admin management panel both use this (see the
 * "Rozaris Platform Audit" memory: "every user and publisher can see how
 * the post clicks and views... every owner of the post can see it, admin
 * too"). 403s silently render nothing rather than an error — a viewer
 * without access to these numbers simply doesn't see the row, same as if
 * it were never rendered. */
export function AnalyticsSummaryInline({ entityType, entityId }: { entityType: "listing" | "project"; entityId: string }) {
  const { t } = useT();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics/summary?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AnalyticsSummary | null) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (!summary) return null;

  return (
    <span className="flex items-center gap-3 text-xs text-neutral-500" title={t("analytics.summaryTooltip")}>
      <span className="flex items-center gap-1">
        <Eye className="h-3.5 w-3.5" /> {summary.view}
      </span>
      <span className="flex items-center gap-1">
        <MessageCircle className="h-3.5 w-3.5" /> {summary.whatsapp_click}
      </span>
      <span className="flex items-center gap-1">
        <Phone className="h-3.5 w-3.5" /> {summary.call_click}
      </span>
    </span>
  );
}
