"use client";

import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

/** Shared Notifications list for every dashboard (User/Private Publisher/
 * Business Publisher — PRD_ROZARIS_User_Types §2/§3/§4 all list "Alerts /
 * Notifications" as a nav item). Notification *content* is generated
 * per-session by src/lib/mockActivity.ts; only read-state persists
 * (`readNotificationIds`), matching the existing store's doc comment. */
export function NotificationsList({ items }: { items: NotificationItem[] }) {
  const { t, locale } = useT();
  const readIds = useAppStore((s) => s.readNotificationIds);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);

  const unreadCount = items.filter((n) => !readIds.includes(n.id)).length;

  if (items.length === 0) {
    return (
      <div className="rounded-panel border border-dashed border-neutral-300 bg-white p-10 text-center">
        <Bell className="mx-auto h-8 w-8 text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-400">{t("dashboard.notificationsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => markAllRead(items.map((n) => n.id))}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
          >
            <Check className="h-3.5 w-3.5" />
            {t("dashboard.markAllRead")}
          </button>
        </div>
      )}
      <div className="divide-y divide-neutral-100 rounded-panel border border-neutral-200 bg-white">
        {items.map((n) => {
          const unread = !readIds.includes(n.id);
          const rowClassName = cn(
            "flex w-full items-start gap-3 px-4 py-3.5 text-left text-sm hover:bg-neutral-50",
            unread && "bg-brand-50/40"
          );
          const content = (
            <>
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  unread ? "bg-brand-500" : "bg-transparent"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium text-neutral-900", !unread && "font-normal text-neutral-600")}>
                  {t(n.titleKey, n.vars)}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{t(n.bodyKey, n.vars)}</p>
                <p className="mt-1 text-[11px] text-neutral-400">{formatRelativeDate(n.createdAt, locale)}</p>
              </div>
            </>
          );
          return n.href ? (
            <Link key={n.id} href={n.href} onClick={() => markRead(n.id)} className={rowClassName}>
              {content}
            </Link>
          ) : (
            <button key={n.id} onClick={() => markRead(n.id)} className={rowClassName}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
