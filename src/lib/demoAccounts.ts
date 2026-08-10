import type { AuthState } from "@/lib/store";
import type { PublisherType } from "@/lib/types";

/**
 * Fixed demo credentials for the frontend prototype's mock sign-in.
 *
 * IMPORTANT: this is not real authentication. There is no backend, no
 * hashing, no session security — every "password" is literally the string
 * "1" and the check happens entirely in the browser. This exists purely so
 * the four ROZARIS account types (per PRD_Authentication_Account_Selection)
 * have distinct, memorable logins to click through during demos, since the
 * app's role model currently only distinguishes "buyer" / "publisher" /
 * "admin" — Private Publisher, Agency, and Developer all share the
 * "publisher" role until the dashboard is built out to branch on org type.
 */
export interface DemoAccount {
  username: string;
  password: string;
  displayName: string;
  role: AuthState["role"];
  orgType?: PublisherType;
  /** The mock Publisher record (src/lib/mockData.ts) this persona's
   * listings/projects are drawn from. Matches orgType's account type. */
  publisherId?: string;
  /** Human label for the PRD account type this persona represents. */
  typeLabel: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: "elira",
    password: "1",
    displayName: "Elira Krasniqi",
    role: "buyer",
    typeLabel: "User",
  },
  {
    username: "genti",
    password: "1",
    displayName: "Genti Hoxha",
    role: "publisher",
    orgType: "private_owner",
    publisherId: "p-andi",
    typeLabel: "Private Publisher",
  },
  {
    username: "alma",
    password: "1",
    displayName: "Alma Berisha",
    role: "publisher",
    orgType: "agency",
    publisherId: "p-vega",
    typeLabel: "Business Publisher — Agency",
  },
  {
    username: "ilir",
    password: "1",
    displayName: "Ilir Shehu",
    role: "publisher",
    orgType: "developer",
    publisherId: "p-alba",
    typeLabel: "Business Publisher — Developer",
  },
  {
    username: "admin",
    password: "1",
    displayName: "Admin",
    role: "admin",
    typeLabel: "Admin",
  },
];

export function findDemoAccount(username: string, password: string): DemoAccount | null {
  const u = username.trim().toLowerCase();
  return (
    DEMO_ACCOUNTS.find((a) => a.username.toLowerCase() === u && a.password === password) ?? null
  );
}
