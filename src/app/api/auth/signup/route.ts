import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * Real account creation — the counterpart to `src/auth.ts`'s Credentials
 * provider, which could only ever authenticate a row that already had a
 * `passwordHash` (previously just the one seeded admin). This is the first
 * route that lets a real buyer or publisher sign up for themselves (real
 * auth to UI pass — see the "Rozaris Platform Audit" memory). Does not sign
 * the new account in itself — the client calls `signIn("credentials", ...)`
 * from `next-auth/react` right after a successful response, same round
 * trip any other credentials flow would use.
 */
const signupSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["buyer", "publisher"]),
    orgType: z.enum(["private_owner", "agency", "developer"]).optional(),
    phone: z.string().optional(),
  })
  .refine((v) => v.role !== "publisher" || !!v.orgType, {
    message: "orgType is required for a publisher account.",
    path: ["orgType"],
  })
  .refine((v) => v.role !== "publisher" || !!v.phone?.trim(), {
    message: "phone is required for a publisher account.",
    path: ["phone"],
  });

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, email, password, role, orgType, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let slug = slugify(name);
  let suffix = 2;
  while (await prisma.publisher.findUnique({ where: { slug } })) {
    slug = `${slugify(name)}-${suffix}`;
    suffix++;
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email, passwordHash, role },
    });
    if (role === "publisher") {
      await tx.publisher.create({
        data: {
          name,
          slug,
          type: orgType!,
          phone: phone!.trim(),
          ownerUserId: created.id,
        },
      });
    }
    return created;
  });

  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
