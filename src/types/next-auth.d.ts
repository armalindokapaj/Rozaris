import type { DefaultSession } from "next-auth";

// Augment Auth.js's Session/User/JWT shapes with our own `role` field
// (see src/auth.ts's jwt/session callbacks, which populate it).
declare module "next-auth" {
  interface Session {
    user: {
      role?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}
