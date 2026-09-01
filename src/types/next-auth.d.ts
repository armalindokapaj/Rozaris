import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: string;
      status?: string;
      superAdmin?: boolean;
      adminScopes?: string[];
      publisherId?: string;
      orgType?: string;
      orgRole?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: string;
    status?: string;
    superAdmin?: boolean;
    adminScopes?: string[];
    publisherId?: string;
    orgType?: string;
    orgRole?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    status?: string;
    superAdmin?: boolean;
    adminScopes?: string[];
    publisherId?: string;
    orgType?: string;
    orgRole?: string;
  }
}
