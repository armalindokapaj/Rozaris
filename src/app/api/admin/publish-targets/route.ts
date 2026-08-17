import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { generatePublicKey } from "@/lib/publishing/publicKey";

const createTargetSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["marketplace", "embed", "custom_domain", "kiosk"]),
  // Admin-facing label only — see the model's own doc comment.
  name: z.string().min(1).max(120),
  customDomain: z.string().min(1).max(255).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  viewerOverrides: z.record(z.string(), z.unknown()).optional(),
  licenseStartsAt: z.coerce.date().optional(),
  licenseEndsAt: z.coerce.date().optional(),
});

/**
 * Multi-Channel Publishing PRD Phase 2 — admin CRUD for
 * `ProjectPublishTarget` ("where is this Project's digital twin actually
 * deployed"). requireAdmin()-gated like /api/environment-presets: this is
 * an internal control-plane route, never called by the public runtime
 * (that's Phase 5's `/api/viewer/v1/t/[publicKey]/bootstrap`, which
 * resolves a target by its opaque `publicKey`, not this route's ids).
 *
 * Deliberately minimal for Phase 2: no `activeReleaseId` here — assigning
 * a release to a target is a "deploy" action that needs the release
 * compiler (Phase 3) and the admin Distribution UI (Phase 7) to mean
 * anything; a bare id-setter now would let an admin point a target at a
 * release id that can't yet do anything.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const projectId = new URL(request.url).searchParams.get("projectId");
  const targets = await prisma.projectPublishTarget.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(targets);
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createTargetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, name: true, publisherId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const target = await prisma.projectPublishTarget.create({
    data: {
      publicKey: generatePublicKey(),
      projectId: project.id,
      // Denormalized from the project, not client-supplied — see the
      // schema's own doc comment on why this column exists at all.
      publisherId: project.publisherId,
      type: parsed.data.type,
      name: parsed.data.name,
      customDomain: parsed.data.customDomain,
      allowedOrigins: parsed.data.allowedOrigins ?? [],
      branding: parsed.data.branding as Prisma.InputJsonValue | undefined,
      viewerOverrides: parsed.data.viewerOverrides as Prisma.InputJsonValue | undefined,
      licenseStartsAt: parsed.data.licenseStartsAt,
      licenseEndsAt: parsed.data.licenseEndsAt,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Publish target created",
    entityType: "ProjectPublishTarget",
    entityId: target.id,
    entityLabel: `${project.name} → ${target.name}`,
    newState: target,
    metadata: { projectId: project.id, type: target.type },
  });

  return NextResponse.json(target);
}
