import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const createConnectorSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["google_sheets", "api", "manual"]),
  externalResourceId: z.string().min(1).optional(),
  columnMapping: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Multi-Channel Publishing PRD Phase 8 — admin CRUD for
 * `InventoryConnector`, mirroring `/api/admin/publish-targets`'s exact
 * convention. `type: api` (a future CRM/ERP integration) can be created
 * here for record-keeping/UI purposes but its `/sync` route rejects with
 * "not implemented" — no real external API target is defined for it yet.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const projectId = new URL(request.url).searchParams.get("projectId");
  const connectors = await prisma.inventoryConnector.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(connectors);
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createConnectorSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true, name: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (parsed.data.type === "google_sheets" && !parsed.data.externalResourceId) {
    return NextResponse.json({ error: "A Google Sheet id is required for this connector type." }, { status: 400 });
  }

  const connector = await prisma.inventoryConnector.create({
    data: {
      projectId: project.id,
      type: parsed.data.type,
      externalResourceId: parsed.data.externalResourceId,
      columnMapping: parsed.data.columnMapping as Prisma.InputJsonValue | undefined,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Inventory connector created",
    entityType: "InventoryConnector",
    entityId: connector.id,
    entityLabel: `${project.name} · ${connector.type}`,
    metadata: { projectId: project.id },
  });

  return NextResponse.json(connector);
}
