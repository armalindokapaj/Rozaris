import type { LeadItem, LeadSource, LeadStatus, NotificationItem } from "./types";
import type { AuthState } from "./store";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export function buyerNotifications(): NotificationItem[] {
  return [
    {
      id: "ntf-buyer-1",
      type: "price_change",
      titleKey: "notif.buyerPriceChangeTitle",
      bodyKey: "notif.buyerPriceChangeBody",
      href: "/saved",
      createdAt: hoursAgo(6),
    },
    {
      id: "ntf-buyer-2",
      type: "search_match",
      titleKey: "notif.buyerSearchMatchTitle",
      bodyKey: "notif.buyerSearchMatchBody",
      href: "/saved",
      createdAt: hoursAgo(20),
    },
    {
      id: "ntf-buyer-3",
      type: "listing_availability",
      titleKey: "notif.buyerAvailabilityTitle",
      bodyKey: "notif.buyerAvailabilityBody",
      href: "/saved",
      createdAt: daysAgo(3),
    },
    {
      id: "ntf-buyer-4",
      type: "account_message",
      titleKey: "notif.buyerWelcomeTitle",
      bodyKey: "notif.buyerWelcomeBody",
      createdAt: daysAgo(7),
    },
  ];
}

export function publisherNotifications(orgType: AuthState["orgType"]): NotificationItem[] {
  const shared: NotificationItem[] = [
    {
      id: "ntf-pub-lead",
      type: "lead",
      titleKey: "notif.pubNewLeadTitle",
      bodyKey: "notif.pubNewLeadBody",
      createdAt: hoursAgo(4),
    },
    {
      id: "ntf-pub-moderation",
      type: "moderation",
      titleKey: "notif.pubApprovedTitle",
      bodyKey: "notif.pubApprovedBody",
      createdAt: daysAgo(1),
    },
    {
      id: "ntf-pub-billing",
      type: "billing",
      titleKey: "notif.pubBillingTitle",
      bodyKey: "notif.pubBillingBody",
      createdAt: daysAgo(4),
    },
  ];
  if (orgType === "developer") {
    shared.unshift({
      id: "ntf-pub-construction",
      type: "project_update",
      titleKey: "notif.pubConstructionTitle",
      bodyKey: "notif.pubConstructionBody",
      createdAt: hoursAgo(10),
    });
  }
  return shared;
}

const LEAD_SOURCES: LeadSource[] = ["phone_click", "whatsapp_click", "listing_inquiry", "digital_twin_inquiry"];
const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "viewing", "negotiating", "won", "lost"];

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function buildDemoLeads(publisherId: string, listingIds: string[], projectIds: string[] = []): LeadItem[] {
  const targets: { listingId?: string; projectId?: string }[] = [
    ...listingIds.slice(0, 4).map((id) => ({ listingId: id })),
    ...projectIds.slice(0, 2).map((id) => ({ projectId: id })),
  ];
  return targets.map((target, i) => {
    const seed = hashSeed(`${publisherId}-${target.listingId ?? target.projectId}-${i}`);
    return {
      id: `lead-${publisherId}-${i}`,
      publisherId,
      ...target,
      source: LEAD_SOURCES[seed % LEAD_SOURCES.length],
      status: LEAD_STATUSES[(seed >> 2) % LEAD_STATUSES.length],
      createdAt: daysAgo((seed % 9) + 1),
    };
  });
}
