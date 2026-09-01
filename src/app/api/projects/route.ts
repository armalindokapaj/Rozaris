import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { getAllProjects, getProjectsByPublisherAnyStatus } from "@/lib/projects.server";
import { resolveLocation } from "@/lib/locations";
import { syncProjectLocationDependents } from "@/lib/projectLocation";

export async function GET(request: Request) {
  const publisherId = new URL(request.url).searchParams.get("publisherId");
  const projects = publisherId
    ? await getProjectsByPublisherAnyStatus(publisherId)
    : await getAllProjects();
  return NextResponse.json(projects);
}

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

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

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

  let { slug } = data;
  const existingBySlug = await prisma.project.findUnique({ where: { slug } });
  if (existingBySlug && existingBySlug.id !== data.id) {
    let suffix = 2;
    while (await prisma.project.findUnique({ where: { slug: `${data.slug}-${suffix}` } })) {
      suffix++;
    }
    slug = `${data.slug}-${suffix}`;
  }

  const existingById = await prisma.project.findUnique({ where: { id: data.id } });
  if (existingById?.deletedAt) {
    return NextResponse.json(
      { error: "This project is in the Recycle Bin — restore it from Super Admin before editing." },
      { status: 409 }
    );
  }

  const location = await resolveLocation(data.neighborhoodId);
  if (!location) {
    return NextResponse.json({ error: `Unknown location "${data.neighborhoodId}".` }, { status: 400 });
  }

  try {
    const project = await prisma.project.upsert({
      where: { id: data.id },
      update: { ...data, slug, publisherId, city: location.cityName, locationId: location.id },
      create: {
        ...data,
        slug,
        publisherId,
        approvalStatus: "pending",
        city: location.cityName,
        locationId: location.id,
      },
    });

    if (
      existingById &&
      (existingById.neighborhoodId !== project.neighborhoodId ||
        existingById.lat !== project.lat ||
        existingById.lng !== project.lng ||
        existingById.locationId !== project.locationId)
    ) {
      await syncProjectLocationDependents(project);
    }

    revalidatePath(`/project/${project.slug}`);
    revalidatePath(`/projects/${project.slug}`);
    if (existingById && existingById.slug !== project.slug) {
      revalidatePath(`/project/${existingById.slug}`);
      revalidatePath(`/projects/${existingById.slug}`);
    }
    revalidatePath("/new-projects");

    const actor = gate.user?.email ?? gate.user?.name ?? "unattributed";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
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
