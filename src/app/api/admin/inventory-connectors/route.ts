import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { parseSheetRef } from "@/lib/integrations/googleSheets";
import { COLUMN_MAPPING_VALUES } from "@/lib/integrations/normalization";

const createConnectorSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["google_sheets", "api", "manual"]),
  sheetUrl: z.string().min(1).optional(),
  externalResourceId: z.string().min(1).optional(),
  columnMapping: z.record(z.string(), z.enum(COLUMN_MAPPING_VALUES)).optional(),
});

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

  let externalResourceId = parsed.data.externalResourceId ?? null;
  let gid = "0";
  if (parsed.data.type === "google_sheets") {
    const raw = parsed.data.sheetUrl ?? parsed.data.externalResourceId;
    if (!raw) {
      return NextResponse.json({ error: "A Google Sheet link is required for this connector type." }, { status: 400 });
    }
    const ref = parseSheetRef(raw);
    if (!ref) {
      return NextResponse.json(
        { error: "That doesn't look like a Google Sheets link. Copy the URL from the sheet's address bar (docs.google.com/spreadsheets/d/…)." },
        { status: 400 }
      );
    }
    externalResourceId = ref.sheetId;
    gid = ref.gid;
  }

  const duplicate = await prisma.inventoryConnector.findFirst({
    where: { projectId: project.id, type: parsed.data.type },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "This project already has a connector of that type — edit or remove it instead of adding a second one." },
      { status: 409 }
    );
  }

  const connector = await prisma.inventoryConnector.create({
    data: {
      projectId: project.id,
      type: parsed.data.type,
      externalResourceId,
      configuration: { gid } as Prisma.InputJsonValue,
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
    metadata: { projectId: project.id, sheetId: externalResourceId, gid },
  });

  return NextResponse.json(connector);
}
