import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { getRequiredFieldsForScope } from "@/lib/fieldPolicies";

/**
 * Account & Profile System PRD v1.0 §4 "Standard User Profile" — the one
 * real read/write surface for the signed-in account's own personal-profile
 * fields (firstName/lastName/country/preferredLanguage/preferredCurrency/
 * preferredContactMethod/cityLocationId), replacing the buyer dashboard's
 * previous local-only Zustand `buyerProfile` edits. Session-scoped only —
 * a user can only ever read/write their own row, there is no `userId`
 * param.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      emailVerified: true,
      phone: true,
      phoneVerifiedAt: true,
      image: true,
      country: true,
      preferredLanguage: true,
      preferredCurrency: true,
      preferredContactMethod: true,
      cityLocationId: true,
      cityLocation: { select: { id: true, officialName: true } },
      marketingConsent: true,
      marketingConsentAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const requiredFields = await getRequiredFieldsForScope("standard_user");
  return NextResponse.json({ profile: user, requiredFields });
}

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional().nullable(),
  lastName: z.string().trim().min(1).max(80).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  preferredLanguage: z.string().trim().max(10).optional().nullable(),
  preferredCurrency: z.string().trim().max(10).optional().nullable(),
  preferredContactMethod: z.enum(["phone", "email", "whatsapp"]).optional().nullable(),
  cityLocationId: z.string().trim().max(80).optional().nullable(),
});

/** Field name in the request body -> the FieldPolicy key that governs it
 * (§11.4 "Backend enforcement — the API/service layer must enforce...
 * even when requests bypass the UI"). */
const POLICY_KEY_FOR_FIELD: Record<string, string> = {
  firstName: "standard_user.firstName",
  lastName: "standard_user.lastName",
  phone: "standard_user.phone",
  country: "standard_user.country",
  preferredLanguage: "standard_user.preferredLanguage",
  preferredCurrency: "standard_user.preferredCurrency",
  preferredContactMethod: "standard_user.preferredContactMethod",
  cityLocationId: "standard_user.cityLocationId",
};

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const patch = parsed.data;

  // Enforce admin-set "Must fill" policy server-side — a field explicitly
  // included in the request body as empty/null on a Required field is
  // rejected, regardless of what the client-side form allowed.
  const requiredFields = await getRequiredFieldsForScope("standard_user");
  const missing: string[] = [];
  for (const [field, policyKey] of Object.entries(POLICY_KEY_FOR_FIELD)) {
    if (!requiredFields[policyKey]) continue;
    if (!(field in patch)) continue; // not being touched by this request
    const value = patch[field as keyof typeof patch];
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return NextResponse.json({ error: "Missing required fields.", fields: missing }, { status: 400 });
  }

  if (patch.cityLocationId) {
    const location = await prisma.location.findUnique({ where: { id: patch.cityLocationId } });
    if (!location) {
      return NextResponse.json({ error: "Unknown cityLocationId." }, { status: 400 });
    }
  }

  const before = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!before) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.country !== undefined ? { country: patch.country } : {}),
      ...(patch.preferredLanguage !== undefined ? { preferredLanguage: patch.preferredLanguage } : {}),
      ...(patch.preferredCurrency !== undefined ? { preferredCurrency: patch.preferredCurrency } : {}),
      ...(patch.preferredContactMethod !== undefined
        ? { preferredContactMethod: patch.preferredContactMethod }
        : {}),
      ...(patch.cityLocationId !== undefined ? { cityLocationId: patch.cityLocationId } : {}),
      // Changing phone re-requires phone verification (§9.3 "Re-verification
      // triggers — phone ownership changes").
      ...(patch.phone !== undefined && patch.phone !== before.phone ? { phoneVerifiedAt: null } : {}),
      // A display name kept in sync from first/last for every pre-existing
      // read site that still reads `name`.
      ...(patch.firstName !== undefined || patch.lastName !== undefined
        ? { name: `${patch.firstName ?? before.firstName ?? ""} ${patch.lastName ?? before.lastName ?? ""}`.trim() || before.name }
        : {}),
    },
  });

  await logAuditEvent({
    actor: session.user.email ?? session.user.name ?? "self",
    actorId: session.user.id,
    action: "Profile updated",
    entityType: "User",
    entityId: session.user.id,
    previousState: before,
    newState: updated,
  });

  return NextResponse.json({ ok: true });
}
