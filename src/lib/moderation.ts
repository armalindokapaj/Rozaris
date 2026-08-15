/**
 * Content-lifecycle helpers shared by every write-gated route and admin
 * surface that needs to know "is this account/post currently blocked" —
 * one place for the time-bound "idle" logic added across
 * User/Publisher/Listing/Project (see the "Rozaris Platform Audit" memory).
 *
 * Deliberately isomorphic (no `@/lib/db` import) — pure functions over
 * whatever row shape a caller already has, so both API routes (Prisma
 * rows) and admin UI components (already-fetched JSON) can use them
 * without duplicating the expiry math.
 */

/** A time-bound restriction is only "active" while `until` is still in the
 * future — once it lapses, the restriction is naturally lifted with no
 * second admin action required (a real cron/expiry job isn't needed; every
 * write-gated route just checks `now()` against this on the way in). */
function isWithin(until: Date | string | null | undefined): boolean {
  if (!until) return false;
  const untilMs = typeof until === "string" ? new Date(until).getTime() : until.getTime();
  return untilMs > Date.now();
}

export function isUserIdle(user: { status: string; statusUntil?: Date | string | null }): boolean {
  if (user.status === "suspended" || user.status === "disabled") return true;
  if (user.status === "restricted") return isWithin(user.statusUntil);
  return false;
}

export function isPublisherIdle(publisher: {
  restricted: boolean;
  restrictedUntil?: Date | string | null;
}): boolean {
  if (!publisher.restricted) return false;
  // `restrictedUntil: null` alongside `restricted: true` is the original,
  // indefinite behavior (unchanged) — only a *set* expiry ever lifts it
  // automatically.
  return publisher.restrictedUntil == null || isWithin(publisher.restrictedUntil);
}

export function isListingIdle(listing: { idleUntil?: Date | string | null }): boolean {
  return isWithin(listing.idleUntil);
}

export function isProjectIdle(project: { idleUntil?: Date | string | null }): boolean {
  return isWithin(project.idleUntil);
}

/** A listing the publisher hasn't confirmed as still-current in over 90
 * days — surfaced as a "needs an update" prompt on their dashboard, not a
 * status change (a stale listing stays exactly as visible as before; this
 * is a nudge, not a penalty). */
export const STALE_LISTING_DAYS = 90;

export function isListingStale(listing: { lastRenewedAt?: Date | string | null }): boolean {
  if (!listing.lastRenewedAt) return false;
  const renewedMs =
    typeof listing.lastRenewedAt === "string" ? new Date(listing.lastRenewedAt).getTime() : listing.lastRenewedAt.getTime();
  return Date.now() - renewedMs > STALE_LISTING_DAYS * 24 * 60 * 60 * 1000;
}
