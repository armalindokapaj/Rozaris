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
  return publisher.restrictedUntil == null || isWithin(publisher.restrictedUntil);
}

export function isListingIdle(listing: { idleUntil?: Date | string | null }): boolean {
  return isWithin(listing.idleUntil);
}

export function isProjectIdle(project: { idleUntil?: Date | string | null }): boolean {
  return isWithin(project.idleUntil);
}

export const STALE_LISTING_DAYS = 90;

export function isListingStale(listing: { lastRenewedAt?: Date | string | null }): boolean {
  if (!listing.lastRenewedAt) return false;
  const renewedMs =
    typeof listing.lastRenewedAt === "string" ? new Date(listing.lastRenewedAt).getTime() : listing.lastRenewedAt.getTime();
  return Date.now() - renewedMs > STALE_LISTING_DAYS * 24 * 60 * 60 * 1000;
}
