import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, requestIp } from "@/lib/rateLimit";

/** Shared by `authorize()` (initial sign-in) and the `jwt` callback's
 * `trigger === "update"` branch (re-resolve after a write that changes
 * publisher affiliation, e.g. accepting an org invitation, without
 * forcing a full sign-out/sign-in). See `authorize()` below for the
 * "owning it directly vs. an active OrganizationMembership" rule. */
async function resolvePublisherContext(userId: string, role: string) {
  const ownedPublisher =
    role === "publisher" ? await prisma.publisher.findUnique({ where: { ownerUserId: userId } }) : null;
  const membership =
    role === "publisher" && !ownedPublisher
      ? await prisma.organizationMembership.findFirst({
          where: { userId, status: "active" },
          include: { publisher: true },
        })
      : null;
  const publisher = ownedPublisher ?? membership?.publisher ?? null;
  return { publisherId: publisher?.id, orgType: publisher?.type, orgRole: ownedPublisher ? "owner" : membership?.role };
}

/**
 * Real auth (Auth.js v5). Wired into the UI as of the real-auth-to-UI pass
 * (see the "Rozaris Platform Audit" memory): SignInModal/JoinMenu/buyer
 * signup call `signIn("credentials", ...)` for real, and
 * `AuthSessionSync.tsx` mirrors the resulting session into the Zustand
 * `auth` slice every existing dashboard/component already reads, so that
 * rewire didn't need to touch each of those components individually.
 * `src/lib/demoAccounts.ts` now only maps each demo persona onto its real
 * seeded email for the sign-in UI's quick-fill buttons — it's no longer
 * the auth check itself.
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
      authorize: async (credentials, request) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        // Platform Audit (finding H2, see the "rozaris-publish-security-
        // audit" memory) — sign-in had no throttling at all, which is what
        // turns a weak password (finding C1) into something practically
        // guessable. Keyed by IP, not email: limiting by email alone would
        // let an attacker lock a real user out just by failing their login
        // repeatedly from elsewhere. Returning null (not a distinguishing
        // error) matches this function's own existing convention below for
        // suspended/disabled accounts — indistinguishable from a wrong
        // password to the caller.
        if (rateLimit(`signin:${requestIp(request)}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        // Soft-deleted accounts sign in nowhere, same as if the row didn't
        // exist — Super Admin control/audit pass.
        if (user.deletedAt) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Account suspension/restoration (PRD_ROZARIS_Admin §12 "Account
        // controls") — enforced at the one real place sign-in happens.
        // `restricted` deliberately does NOT block sign-in (it's a lighter
        // "no new publishing" state on Publisher, not an account lock).
        // Returning null here (not throwing) keeps this indistinguishable
        // from a wrong password to callers like useAdminSessionRepair —
        // giving suspended/disabled their own user-facing message is a
        // sign-in UI concern, out of scope for this pass.
        if (user.status === "suspended" || user.status === "disabled") return null;

        // A publisher-role user resolves to exactly one Publisher row one
        // of two ways (Account & Profile System PRD v1.0 §8 "Business
        // Teams" — additive on top of the original real-auth-to-UI pass):
        // owning it directly, or holding an active OrganizationMembership
        // into someone else's. Resolved once here rather than on every
        // gated route/session read.
        const orgContext = await resolvePublisherContext(user.id, user.role);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          superAdmin: user.superAdmin,
          adminScopes: user.adminScopes,
          ...orgContext,
        };
      },
    }),
  ],
  callbacks: {
    // Role lives on our User row, not the default Auth.js user shape — carry
    // it through the JWT so `session.user.role` is available everywhere
    // (route handlers, server components, middleware) without a DB hit.
    // Super Admin control/audit pass added id/status/superAdmin/adminScopes
    // alongside role, same pattern — requireSuperAdmin()/requireScope() in
    // src/lib/adminAuth.ts read these straight off the session rather than
    // re-querying User on every gated route. publisherId/orgType (real
    // auth to UI pass) follow the same pattern for requirePublisherSession()
    // and the client's session->Zustand `auth` mirror.
    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.superAdmin = user.superAdmin;
        token.adminScopes = user.adminScopes;
        token.publisherId = user.publisherId;
        token.orgType = user.orgType;
        token.orgRole = user.orgRole;
      } else if (trigger === "update" && typeof token.id === "string" && typeof token.role === "string") {
        // A client-side `useSession().update()` call — used right after a
        // write that changes role/publisher affiliation (accepting an org
        // invitation) — re-resolves from the DB instead of forcing a full
        // sign-out/sign-in to see the new session shape.
        const dbUser = await prisma.user.findUnique({ where: { id: token.id } });
        if (dbUser) {
          token.role = dbUser.role;
          token.status = dbUser.status;
          const orgContext = await resolvePublisherContext(dbUser.id, dbUser.role);
          token.publisherId = orgContext.publisherId;
          token.orgType = orgContext.orgType;
          token.orgRole = orgContext.orgRole;
        }
      }
      return token;
    },
    // `token.X` casts below are necessary, not decorative: next-auth/jwt's
    // JWT type re-exports @auth/core/jwt's `interface JWT extends
    // Record<string, unknown>`, so property reads resolve through that
    // index signature to `unknown` even with the module augmentation in
    // src/types/next-auth.d.ts declaring them explicitly (a known
    // declaration-merging gap against a re-exported type) — this exact
    // pattern already existed for `role` before this pass.
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string | undefined;
        session.user.status = token.status as string | undefined;
        session.user.superAdmin = token.superAdmin as boolean | undefined;
        session.user.adminScopes = token.adminScopes as string[] | undefined;
        session.user.publisherId = token.publisherId as string | undefined;
        session.user.orgType = token.orgType as string | undefined;
        session.user.orgRole = token.orgRole as string | undefined;
      }
      return session;
    },
  },
});
