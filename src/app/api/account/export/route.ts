import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

/**
 * Account & Profile System PRD v1.0 §10.2 "Data export — Provide a
 * user-accessible request/process." Real and synchronous — a personal
 * account's own data is small enough to assemble and return directly as a
 * downloadable JSON file, no async job/email-delivery pipeline needed.
 * Every domain this session's Account & Profile System phases made real:
 * profile, preferences, saved items/searches, follows, recently viewed,
 * notifications, consent, organization membership, and (if the account
 * owns one) its Publisher/organization row. Never includes another
 * account's data or admin-only fields (adminScopes, superAdmin, internal
 * verification review notes are the requester's own, which is fine —
 * §9.4 "internal risk/moderation notes" restricts OTHER users seeing it,
 * not the subject themselves).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const userId = session.user.id;

  const [user, savedItems, savedSearches, follows, recentlyViewed, notifications, memberships, publisher] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          phone: true,
          phoneVerifiedAt: true,
          firstName: true,
          lastName: true,
          name: true,
          country: true,
          preferredLanguage: true,
          preferredCurrency: true,
          preferredContactMethod: true,
          cityLocationId: true,
          marketingConsent: true,
          marketingConsentAt: true,
          termsAcceptedAt: true,
          identityVerificationStatus: true,
          buyerPreferences: true,
          createdAt: true,
        },
      }),
      prisma.savedItem.findMany({ where: { userId } }),
      prisma.savedSearch.findMany({ where: { userId } }),
      prisma.follow.findMany({ where: { userId } }),
      prisma.recentlyViewedEntry.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.organizationMembership.findMany({ where: { userId }, include: { publisher: { select: { name: true } } } }),
      prisma.publisher.findUnique({ where: { ownerUserId: userId } }),
    ]);

  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    account: user,
    saved: savedItems,
    savedSearches,
    follows,
    recentlyViewed,
    notifications,
    organizationMemberships: memberships.map((m) => ({
      organization: m.publisher.name,
      role: m.role,
      status: m.status,
      since: m.createdAt,
    })),
    ownedOrganization: publisher,
  };

  await logAuditEvent({
    actor: session.user.email ?? session.user.name ?? "self",
    actorId: userId,
    action: "Data export downloaded",
    entityType: "User",
    entityId: userId,
  });

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rozaris-account-export-${userId}.json"`,
    },
  });
}
