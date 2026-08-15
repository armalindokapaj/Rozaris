import { prisma } from "@/lib/db";

/**
 * Account & Profile System PRD v1.0 §5.3 "Notification preferences" —
 * real producers. Previously `Notification` (prisma/schema.prisma) was a
 * real table with zero call sites anywhere in the app; the buyer
 * dashboard's Alerts tab read `src/lib/mockActivity.ts` instead. This file
 * is the one place a real row gets created — each producer below is
 * called from the write route that actually causes the event (a price
 * edit, a status change, a new unit), not a polling job, since this app
 * has no background-worker infrastructure.
 *
 * Deliberately narrow: only the three events with an unambiguous, cheap
 * trigger are wired (price drop / availability change / new unit in a
 * followed project). "New saved-search match" and "new projects in a
 * followed area" would need a real filter-matching engine against
 * `SavedSearch.filters` (still an opaque, unvalidated JSON blob — no
 * "create a saved search" UI has ever written a real structured query
 * into it) and area-following (`Follow` only supports
 * project/developer kinds) respectively — both explicitly out of scope
 * for this pass.
 */
async function notify(input: {
  userId: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  vars?: Record<string, string>;
  href?: string;
}) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      // Prisma's Json columns reject an explicit `undefined` (same gotcha
      // noted in src/lib/audit.ts) — only include the key when there's a
      // real value.
      ...(input.vars !== undefined ? { vars: input.vars } : {}),
      href: input.href,
    },
  });
}

/** Called from `PATCH /api/listings/[id]` when a real numeric price
 * decrease happens on a listing with real `SavedItem` savers. */
export async function notifyPriceDrop(listing: {
  id: string;
  slug: string;
  title: string;
  price: number;
  currency: string;
}) {
  const savers = await prisma.savedItem.findMany({
    where: { entityType: "listing", entityId: listing.id },
    select: { userId: true },
  });
  if (savers.length === 0) return;

  const formattedPrice = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(listing.price);
  await Promise.all(
    savers.map((s) =>
      notify({
        userId: s.userId,
        type: "price_change",
        titleKey: "notif.priceDropTitle",
        bodyKey: "notif.priceDropBody",
        vars: { title: listing.title, price: `${formattedPrice} ${listing.currency}` },
        href: `/listing/${listing.slug}`,
      })
    )
  );
}

/** Called from the same route when a listing's status moves into
 * sold/rented/suspended/archived/expired (or back to active) with real
 * savers. */
export async function notifyAvailabilityChange(listing: { id: string; slug: string; title: string }, status: string) {
  const savers = await prisma.savedItem.findMany({
    where: { entityType: "listing", entityId: listing.id },
    select: { userId: true },
  });
  if (savers.length === 0) return;

  await Promise.all(
    savers.map((s) =>
      notify({
        userId: s.userId,
        type: "listing_availability",
        titleKey: "notif.availabilityChangedTitle",
        bodyKey: "notif.availabilityChangedBody",
        vars: { title: listing.title, status },
        href: `/listing/${listing.slug}`,
      })
    )
  );
}

/** Called from `POST /api/projects/[id]/units` when a new Unit is added
 * to a project with real `Follow` (kind: project) followers. */
export async function notifyNewUnit(project: { id: string; slug: string; name: string }) {
  const followers = await prisma.follow.findMany({
    where: { kind: "project", targetId: project.id },
    select: { userId: true },
  });
  if (followers.length === 0) return;

  await Promise.all(
    followers.map((f) =>
      notify({
        userId: f.userId,
        type: "project_update",
        titleKey: "notif.newUnitTitle",
        bodyKey: "notif.newUnitBody",
        vars: { project: project.name },
        href: `/project/${project.slug}`,
      })
    )
  );
}
