import type { PublisherType, PublisherVerificationStatus, DeveloperStatus, IdentityVerificationStatus } from "@/generated/prisma";

export type PublicBadge = "verified_publisher" | "verified_business" | "verified_developer";

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
