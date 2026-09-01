import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, requestIp } from "@/lib/rateLimit";

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

        if (rateLimit(`signin:${requestIp(request)}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (user.deletedAt) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        if (user.status === "suspended" || user.status === "disabled") return null;

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
