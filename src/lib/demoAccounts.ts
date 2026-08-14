/**
 * Quick-fill demo credentials for SignInModal/JoinMenu's "one click" login
 * buttons. Real auth to UI pass (see the "Rozaris Platform Audit" memory):
 * these no longer ARE the auth check — `signIn("credentials", {email,
 * password})` from `next-auth/react` does, against the real seeded
 * `passwordHash` rows `prisma/seed.ts` writes (all password "1", matching
 * this file's previous convention). This file now only maps each of the
 * four PRD account types (PRD_Authentication_Account_Selection) onto the
 * real seed email that persona signs in as, so the demo buttons keep
 * working unchanged.
 */
export interface DemoAccount {
  email: string;
  password: string;
  displayName: string;
  /** Human label for the PRD account type this persona represents. */
  typeLabel: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "buyer@seed.rozaris.demo",
    password: "1",
    displayName: "Elira Krasniqi",
    typeLabel: "User",
  },
  {
    email: "andi-hoxha@seed.rozaris.demo",
    password: "1",
    displayName: "Andi Hoxha",
    typeLabel: "Private Publisher",
  },
  {
    email: "vega-real-estate@seed.rozaris.demo",
    password: "1",
    displayName: "Vega Real Estate",
    typeLabel: "Business Publisher — Agency",
  },
  {
    email: "alba-construction@seed.rozaris.demo",
    password: "1",
    displayName: "ALBA Construction",
    typeLabel: "Business Publisher — Developer",
  },
  {
    email: "admin@rozaris.demo",
    password: "1",
    displayName: "Admin",
    typeLabel: "Admin",
  },
];
