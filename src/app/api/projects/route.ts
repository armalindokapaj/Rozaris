import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { getAllProjects, getProjectsByPublisherAnyStatus } from "@/lib/projects.server";
import { resolveLocation } from "@/lib/locations";

/** Public project catalog — the client-side equivalent of
 * `projects.server.ts`'s `getAllProjects()` for consumers that can't be a
 * server component (SearchBar, MapView, the admin console's own project
 * pickers). No auth gate, same convention as every other public GET in
 * this app (`GET /api/listings`, `GET /api/publishers`).
 *
 * `?publisherId=` switches to that publisher's own projects for their
 * dashboard — any `approvalStatus`, mirroring `GET /api/listings`'s same
 * `?publisherId=` distinction. */
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

/**
 * Creates/updates a real Postgres row for a project — the public catalog
 * (`GET` above) reads straight from this table now (see the "Rozaris
 * Platform Audit" memory's Projects/Units migration), so this is a real
 * publish action, not just plumbing for the 3D pipeline as the old comment
 * here said.
 *
 * Both real callers (NewProjectModal.tsx, the `/admin/projects/new` wizard)
 * are admin-only surfaces, so this is `requireAdmin()`-gated like every
 * other admin write route (src/lib/adminAuth.ts) — closes the same class
 * of impersonation gap already fixed on `POST /api/listings`.
 */
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

  // Canonical Location System — hard validation, same rule `POST
  // /api/listings` already enforces. Both real callers (NewProjectModal,
  // EditProjectModal — see MEMORY note "rozaris-controlled-taxonomy-spec")
  // now derive `neighborhoodId` from a real Location dropdown and `city`
  // from that selection, so any request reaching this route with an
  // unresolvable id is either a stale client or a direct API call, not a
  // legitimate admin edit — reject rather than silently store a
  // non-canonical location.
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
        // Real bug found live (reported as "a project I saved as a draft
        // was already published") — every project created through either
        // real caller (NewProjectModal.tsx, the `/admin/projects/new`
        // wizard) went straight to `active` on creation, immediately live
        // on the public platform (search, listings, /project/[slug]) with
        // zero draft/review window, even though the wizard's own "Status"
        // field displayed "Draft" the whole time. Starts `pending` now —
        // out of the public catalog (`PUBLIC_WHERE` in projects.server.ts)
        // — until an admin explicitly publishes it via `PATCH
        // /api/admin/projects/[projectId]/publication`. A `pending`
        // project's slug still resolves in the 3D viewer for its own
        // creator through `CustomProjectPreview`'s Zustand fallback (see
        // that component's doc comment) — a real "preview while in draft"
        // path, not a new one built for this.
        approvalStatus: "pending",
        city: location.cityName,
        locationId: location.id,
      },
    });

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
