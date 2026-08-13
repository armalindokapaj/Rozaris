import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { logAuditEvent } from "@/lib/audit";

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

  // `slug` carries its own `@unique` constraint independent of the `id`
  // this upsert is keyed on — two different projects submitting the same
  // (client-computed, name-derived) slug previously crashed this route
  // with an unhandled Prisma P2002, surfaced to the caller as a raw HTML
  // 500 page instead of JSON. Real bug hit by the MVP admin wizard
  // (`/admin/projects/new`) on a retry with the same project name after a
  // page reload — see "rozaris-mvp-admin-project-pipe" memory. Auto-dedupe
  // instead of crashing: a genuine update (same id) keeps its own slug.
  let { slug } = data;
  const existingBySlug = await prisma.project.findUnique({ where: { slug } });
  if (existingBySlug && existingBySlug.id !== data.id) {
    let suffix = 2;
    while (await prisma.project.findUnique({ where: { slug: `${data.slug}-${suffix}` } })) {
      suffix++;
    }
    slug = `${data.slug}-${suffix}`;
  }

  // A soft-deleted project must be restored from the Super Admin Recycle
  // Bin before it can be edited again — an ordinary save must not silently
  // revive it.
  const existingById = await prisma.project.findUnique({ where: { id: data.id } });
  if (existingById?.deletedAt) {
    return NextResponse.json(
      { error: "This project is in the Recycle Bin — restore it from Super Admin before editing." },
      { status: 409 }
    );
  }

  try {
    const project = await prisma.project.upsert({
      where: { id: data.id },
      update: { ...data, slug, publisherId },
      create: { ...data, slug, publisherId, approvalStatus: "active" },
    });

    // Soft (not required) session read — this route still has no real
    // auth gate (see the doc comment above), so `actor` falls back to an
    // honest "unattributed" label rather than fabricating one; Before/
    // After tracking is still real either way (previousState/newState).
    const session = await auth().catch(() => null);
    const actor = session?.user?.email ?? session?.user?.name ?? "unattributed (no auth gate on this route)";
    await logAuditEvent({
      actor,
      actorId: session?.user?.id,
      action: existingById ? "Project updated" : "Project created",
      entityType: "Project",
      entityId: project.id,
      entityLabel: project.name,
      previousState: existingById ?? undefined,
      newState: project,
    });

    return NextResponse.json(project);
  } catch (err) {
    console.error("POST /api/projects failed", err);
    return NextResponse.json({ error: "Could not save the project — try again." }, { status: 500 });
  }
}
