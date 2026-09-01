import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

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
