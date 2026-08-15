import type { PublisherType, PublisherVerificationStatus, DeveloperStatus, IdentityVerificationStatus } from "@/generated/prisma";

/**
 * Account & Profile System PRD v1.0 §9.2 "Public badges" — "Do not expose
 * internal level numbers, risk scores, rejection reasons or
 * verification-document details" + "cannot self-select a verified badge"
 * (§11.2). This is the ONE place a public badge is derived from real
 * verification state; nothing renders "Verified" from a client-supplied
 * or ad-hoc value.
 */
export type PublicBadge = "verified_publisher" | "verified_business" | "verified_developer";

/** For a Business Publisher (agency/developer) — a Developer additionally
 * gets "Verified Developer" instead of "Verified Business" once approved
 * as one, since that's a stronger, more specific claim than generic
 * business verification. */
export function getOrgBadge(publisher: {
  type: PublisherType;
  verificationStatus: PublisherVerificationStatus;
  developerStatus: DeveloperStatus;
}): PublicBadge | null {
  if (publisher.type === "private_owner") return null;
  if (publisher.type === "developer" && publisher.developerStatus === "verified") {
    return "verified_developer";
  }
  if (publisher.verificationStatus === "verified") return "verified_business";
  return null;
}

/** For a Private Publisher — §6.3 "A 'Verified' badge may be shown only
 * when the corresponding verification process has actually been
 * completed." Requires the owning account's identity verification, not
 * just a phone/email check. */
export function getPrivatePublisherBadge(owner: {
  identityVerificationStatus: IdentityVerificationStatus;
}): PublicBadge | null {
  return owner.identityVerificationStatus === "verified" ? "verified_publisher" : null;
}

export const PUBLIC_BADGE_LABEL_KEY: Record<PublicBadge, string> = {
  verified_publisher: "admin.badgeVerifiedPublisher",
  verified_business: "admin.badgeVerifiedBusiness",
  verified_developer: "admin.badgeVerifiedDeveloper",
};
