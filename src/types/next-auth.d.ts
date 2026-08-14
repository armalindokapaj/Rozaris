import type { DefaultSession } from "next-auth";

// Augment Auth.js's Session/User/JWT shapes with our own fields (see
// src/auth.ts's jwt/session callbacks, which populate them). `role` predates
// this file; `id`/`status`/`superAdmin`/`adminScopes` were added for the
// Super Admin control/audit pass — requireSuperAdmin()/requireScope() in
// src/lib/adminAuth.ts read them straight off the session.
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: string;
      status?: string;
      superAdmin?: boolean;
      adminScopes?: string[];
      // Real-auth-to-UI pass — a publisher-role user owns exactly one
      // Publisher row (schema's `Publisher.ownerUserId @unique`); carried
      // here so requirePublisherSession() (src/lib/publisherAuth.ts) and
      // the client-side session->Zustand `auth` mirror don't need a
      // separate round trip to resolve "which publisher is this". Absent
      // for buyer/admin sessions.
      publisherId?: string;
      orgType?: string;
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
  }
}
