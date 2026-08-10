import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const projectSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  publisherId: z.string().min(1),
  status: z.enum(["coming_soon", "under_construction", "completed"]),
  progressPercent: z.number().int().min(0).max(100),
  lat: z.number(),
  lng: z.number(),
  neighborhoodId: z.string(),
  city: z.string(),
  setting: z.string(),
  propertyType: z.string(),
  heroImage: z.string().optional().default(""),
  gallery: z.array(z.string()).optional().default([]),
  descriptionEn: z.string().optional().default(""),
  descriptionSq: z.string().optional().default(""),
  buildings: z.array(z.string()).optional().default([]),
  amenities: z.array(z.string()).optional().default([]),
  premium: z.boolean().optional().default(false),
  completionLabel: z.string().optional().default(""),
});

/**
 * Creates a real Postgres row for a project — needed the moment Admin wants
 * to attach anything Postgres-backed to it (a "3D Map Control" GLB, a
 * Project3DConfig) and it isn't one of the seeded mockData.ts projects
 * (prisma/seed.ts). Called right after NewProjectModal.tsx's `addProject()`
 * (Zustand, still the source of truth for what's *displayed* — see the
 * "rozaris-backend-plan" memory on why the public catalog stays on
 * mockData.ts for now) so the two don't drift apart.
 *
 * ⚠️ Same known gap as the other write routes in this app: no auth check
 * yet (real auth isn't wired into the UI). Add one the moment it is.
 */
export async function POST(request: Request) {
  const parsed = projectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { publisherId, ...data } = parsed.data;

  const publisher = await prisma.publisher.findUnique({ where: { id: publisherId } });
  if (!publisher) {
    return NextResponse.json(
      { error: `No publisher row for "${publisherId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const project = await prisma.project.upsert({
    where: { id: data.id },
    update: { ...data, publisherId },
    create: { ...data, publisherId, approvalStatus: "active" },
  });
  return NextResponse.json(project);
}
