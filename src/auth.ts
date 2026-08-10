import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * Real auth (Auth.js v5), replacing lib/demoAccounts.ts + the client-only
 * `auth` slice in lib/store.ts. NOT YET WIRED INTO THE UI — SignInModal and
 * every component reading `useAppStore(s => s.auth)` still use the old mock
 * (see the "rozaris-backend-plan" memory for why that rewire is a separate,
 * deliberately later step: it touches dozens of components and needs a live
 * Postgres database to test sign-up/sign-in/session-persistence against,
 * which doesn't exist until DATABASE_URL is real).
 *
 * Credentials (email + password) rather than the PRD's phone OTP for this
 * first pass — OTP needs a paid SMS provider (Twilio etc.), a separate
 * account/credential this environment doesn't have. Swappable later by
 * adding another provider here without touching callbacks below.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    // Role lives on our User row, not the default Auth.js user shape — carry
    // it through the JWT so `session.user.role` is available everywhere
    // (route handlers, server components, middleware) without a DB hit.
    jwt: ({ token, user }) => {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) session.user.role = token.role as string | undefined;
      return session;
    },
  },
});
