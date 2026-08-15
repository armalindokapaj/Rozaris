import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { NotificationItem } from "@/lib/types";

interface RealNotification {
  id: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  vars: Record<string, string> | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Account & Profile System PRD v1.0 §13 "Notifications — Alert center" —
 * real `GET/PATCH /api/account/notifications`, read only while signed in
 * (matches every other `/api/account/*` real-data hook in this app). Maps
 * the DB row shape onto the existing `NotificationItem` type so the
 * shared `<NotificationsList>` component doesn't need to know the
 * difference between this and the mock feed it also still renders for
 * publisher dashboards. */
export function useAccountNotifications() {
  const signedIn = useAppStore((s) => s.auth.signedIn);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);

  const load = useCallback(() => {
    if (!signedIn) return;
    fetch("/api/account/notifications")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RealNotification[]) => {
        setNotifications(
          rows.map((r) => ({
            id: r.id,
            type: r.type as NotificationItem["type"],
            titleKey: r.titleKey,
            bodyKey: r.bodyKey,
            vars: r.vars ?? undefined,
            href: r.href ?? undefined,
            createdAt: r.createdAt,
          }))
        );
        setReadIds(rows.filter((r) => r.readAt != null).map((r) => r.id));
      })
      .catch(() => {});
  }, [signedIn]);

  useEffect(load, [load]);

  const markRead = useCallback((id: string) => {
    setReadIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    fetch("/api/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(notifications.map((n) => n.id));
    fetch("/api/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => {});
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !readIds.includes(n.id)).length;

  return { notifications, readIds, unreadCount, markRead, markAllRead };
}
