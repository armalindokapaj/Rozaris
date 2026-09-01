import { prisma } from "@/lib/db";

export const FIELD_POLICIES = {
  "standard_user.firstName": { scope: "standard_user", label: "First name", defaultRequired: true },
  "standard_user.lastName": { scope: "standard_user", label: "Last name", defaultRequired: true },
  "standard_user.email": { scope: "standard_user", label: "Email", defaultRequired: true },
  "standard_user.phone": { scope: "standard_user", label: "Phone", defaultRequired: false },
  "standard_user.country": { scope: "standard_user", label: "Country", defaultRequired: false },
  "standard_user.preferredLanguage": { scope: "standard_user", label: "Preferred language", defaultRequired: true },
  "standard_user.preferredCurrency": { scope: "standard_user", label: "Preferred currency", defaultRequired: true },
  "standard_user.preferredContactMethod": {
    scope: "standard_user",
    label: "Preferred contact method",
    defaultRequired: false,
  },
  "standard_user.cityLocationId": { scope: "standard_user", label: "City / preferred area", defaultRequired: false },
  "standard_user.profilePhoto": { scope: "standard_user", label: "Profile photo", defaultRequired: false },
} as const;

export type FieldPolicyKey = keyof typeof FIELD_POLICIES;

export async function isFieldRequired(key: FieldPolicyKey): Promise<boolean> {
  const row = await prisma.fieldPolicy.findUnique({ where: { key } });
  return row?.required ?? FIELD_POLICIES[key].defaultRequired;
}

export async function getRequiredFieldsForScope(
  scope: (typeof FIELD_POLICIES)[FieldPolicyKey]["scope"]
): Promise<Record<string, boolean>> {
  const keys = (Object.keys(FIELD_POLICIES) as FieldPolicyKey[]).filter(
    (k) => FIELD_POLICIES[k].scope === scope
  );
  const rows = await prisma.fieldPolicy.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.required]));
  const result: Record<string, boolean> = {};
  for (const k of keys) {
    result[k] = byKey.get(k) ?? FIELD_POLICIES[k].defaultRequired;
  }
  return result;
}
